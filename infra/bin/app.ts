#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { JockExchangeStack } from "../lib/jock-exchange-stack";

const app = new cdk.App();
new JockExchangeStack(app, "JockExchangeStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
});
