#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { JockExchangeStack } from "../lib/jock-exchange-stack";
import { JockExchangeMarketStack } from "../lib/jock-exchange-market-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

/** Legacy serverless skeleton (Lambda / API GW / Dynamo / Cognito) — not used for bots. */
new JockExchangeStack(app, "JockExchangeStack", { env });

/**
 * Shared market with always-on bots (EC2 + Docker).
 * Deploy: cd infra && npx cdk deploy JockExchangeMarketStack
 * Context: -c budgetEmail=you@example.com -c cloudflareTunnelToken=...
 */
new JockExchangeMarketStack(app, "JockExchangeMarketStack", { env });
