/**
 * Lambda entrypoint for API Gateway (proxy integration).
 * Local Express uses server.js; this wraps the same app for AWS deploy.
 */
import { createApp } from "./app.js";

const app = createApp();

export async function handler(event, context) {
  const { default: serverless } = await import("serverless-http");
  const wrapped = serverless(app);
  return wrapped(event, context);
}
