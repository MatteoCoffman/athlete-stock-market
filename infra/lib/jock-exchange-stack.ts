import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as path from "path";

/**
 * AWS skeleton matching the prototype architecture.
 * Local demo runs Express + JSON store (backend/). Deploy this stack when AWS creds are available.
 *
 * Note: The local Express auth JWT path is used for the running prototype.
 * Cognito is provisioned here so the client can switch to hosted auth later.
 */
export class JockExchangeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, "JockUserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 6,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient("JockAppClient", {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    const table = new dynamodb.Table(this, "JockTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiFn = new lambda.Function(this, "JockApiFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend"), {
        exclude: ["data", "node_modules", "*.md"],
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            "bash",
            "-c",
            "cp -r /asset-input/* /asset-output/ && cd /asset-output && npm install --omit=dev",
          ],
        },
      }),
      environment: {
        TABLE_NAME: table.tableName,
        JWT_SECRET: "replace-me-in-prod",
        ADMIN_TOKEN: "jock-admin-demo",
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
      timeout: cdk.Duration.seconds(29),
      memorySize: 512,
    });

    table.grantReadWriteData(apiFn);

    const api = new apigateway.LambdaRestApi(this, "JockApi", {
      handler: apiFn,
      proxy: true,
      deployOptions: { stageName: "prod" },
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
  }
}
