import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as path from "path";

export interface JockExchangeMarketStackProps extends cdk.StackProps {
  /** Email for AWS Budget alerts (required for the $8 alarm). */
  budgetEmail?: string;
  /** Optional Cloudflare Tunnel token (installs cloudflared as a service). */
  cloudflareTunnelToken?: string;
}

/**
 * Always-on shared market: t3.micro EC2 running Dockerized Express + bots.
 * Persist store.json on the instance volume. Expose HTTPS via Cloudflare Tunnel
 * (no ALB — keeps cost under ~$10/mo). Access the box with SSM Session Manager (no SSH).
 *
 * The older JockExchangeStack (Lambda/API GW/Dynamo/Cognito) stays for a future serverless path.
 */
export class JockExchangeMarketStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: JockExchangeMarketStackProps) {
    super(scope, id, props);

    const budgetEmail =
      props?.budgetEmail || this.node.tryGetContext("budgetEmail") || process.env.JOCK_BUDGET_EMAIL;
    const tunnelToken =
      props?.cloudflareTunnelToken ||
      this.node.tryGetContext("cloudflareTunnelToken") ||
      process.env.CLOUDFLARE_TUNNEL_TOKEN;

    const vpc = new ec2.Vpc(this, "JockMarketVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      secretName: "jock-exchange/jwt-secret",
      description: "JWT signing secret for Jock Exchange API",
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    const adminParam = new ssm.StringParameter(this, "AdminToken", {
      parameterName: "/jock-exchange/admin-token",
      stringValue: "jock-admin-demo",
      description: "Admin token for dividend endpoints (change in console for anything serious)",
    });

    // Always build linux/amd64 — Apple Silicon hosts otherwise push arm64 and
    // t3.micro (x86_64) dies with "exec format error".
    const image = new ecrAssets.DockerImageAsset(this, "ApiImage", {
      directory: path.join(__dirname, "../../backend"),
      file: "Dockerfile",
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryReadOnly"),
      ],
    });
    image.repository.grantPull(role);
    jwtSecret.grantRead(role);
    adminParam.grantRead(role);

    const sg = new ec2.SecurityGroup(this, "InstanceSg", {
      vpc,
      description: "Jock Exchange market EC2 - egress only",
      allowAllOutbound: true,
    });

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;
    const repoUri = image.repository.repositoryUri;
    const imageTag = image.imageTag;
    const jwtArn = jwtSecret.secretArn;

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -euxo pipefail",
      "dnf update -y",
      "dnf install -y docker jq awscli",
      "systemctl enable --now docker",
      "mkdir -p /var/lib/jock-exchange/data",
      `REGION=${region}`,
      `ACCOUNT=${account}`,
      `REPO=${repoUri}`,
      `IMAGE_TAG=${imageTag}`,
      `JWT_ARN=${jwtArn}`,
      'aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"',
      'docker pull "$REPO:$IMAGE_TAG"',
      'JWT_SECRET=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$JWT_ARN" --query SecretString --output text)',
      'ADMIN_TOKEN=$(aws ssm get-parameter --region "$REGION" --name /jock-exchange/admin-token --query Parameter.Value --output text)',
      "docker rm -f jock-api || true",
      'docker run -d --name jock-api --restart unless-stopped \\',
      "  -p 127.0.0.1:4000:4000 \\",
      "  -v /var/lib/jock-exchange/data:/app/data \\",
      '  -e "JWT_SECRET=$JWT_SECRET" \\',
      '  -e "ADMIN_TOKEN=$ADMIN_TOKEN" \\',
      "  -e PORT=4000 \\",
      "  -e BOTS_ENABLED=1 \\",
      '  "$REPO:$IMAGE_TAG"',
      "echo jock-api container started",
    );

    if (tunnelToken) {
      userData.addCommands(
        "curl -fsSL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
        "chmod +x /usr/local/bin/cloudflared",
        `cloudflared service install '${String(tunnelToken).replace(/'/g, "")}'`,
        "systemctl enable --now cloudflared || systemctl restart cloudflared || true",
      );
    }

    const instance = new ec2.Instance(this, "MarketInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role,
      securityGroup: sg,
      userData,
      associatePublicIpAddress: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      requireImdsv2: true,
    });

    cdk.Tags.of(instance).add("app", "jock-exchange");
    cdk.Tags.of(instance).add("role", "shared-market");

    if (budgetEmail) {
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: 8, unit: "USD" },
          budgetName: "jock-exchange-monthly-8",
        },
        notificationsWithSubscribers: [
          {
            notification: {
              comparisonOperator: "GREATER_THAN",
              threshold: 80,
              thresholdType: "PERCENTAGE",
              notificationType: "ACTUAL",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: String(budgetEmail) }],
          },
          {
            notification: {
              comparisonOperator: "GREATER_THAN",
              threshold: 100,
              thresholdType: "PERCENTAGE",
              notificationType: "ACTUAL",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: String(budgetEmail) }],
          },
        ],
      });
    }

    new cdk.CfnOutput(this, "InstanceId", { value: instance.instanceId });
    new cdk.CfnOutput(this, "ApiImageUri", {
      value: `${repoUri}:${imageTag}`,
    });
    new cdk.CfnOutput(this, "JwtSecretArn", { value: jwtSecret.secretArn });
    new cdk.CfnOutput(this, "SsmConnectHint", {
      value: `aws ssm start-session --target ${instance.instanceId}`,
    });
    new cdk.CfnOutput(this, "LocalHealthCheck", {
      value: "On the instance: curl -s http://127.0.0.1:4000/health",
    });
    if (!budgetEmail) {
      new cdk.CfnOutput(this, "BudgetSkipped", {
        value: "Set context budgetEmail or JOCK_BUDGET_EMAIL to create an $8 AWS Budget alarm",
      });
    }
    if (!tunnelToken) {
      new cdk.CfnOutput(this, "TunnelSetup", {
        value:
          "No tunnel token - install cloudflared manually after deploy (see docs/DEPLOY.md)",
      });
    }
  }
}
