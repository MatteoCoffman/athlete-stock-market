import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** Load backend/.env into process.env without overriding existing vars. */
function loadEnvFile() {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    // Allow .env to fill in missing or empty values; never override a real env var.
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

export const STARTING_CASH = 100_000;
export const SHARES_OUTSTANDING = 10_000;
export const PRICE_IMPACT_K = 0.12;
export const JWT_SECRET = process.env.JWT_SECRET || "jock-exchange-dev-secret";
export const PORT = Number(process.env.PORT || 4000);
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "jock-admin-demo";
export const CURRENTS_API_KEY = process.env.CURRENTS_API_KEY || "";

/** Simulated market makers — off with BOTS_ENABLED=0 */
export const BOTS_ENABLED = process.env.BOTS_ENABLED !== "0";
export const BOT_COUNT = Math.max(1, Number(process.env.BOT_COUNT || 12));
export const BOT_INTERVAL_MS = Math.max(800, Number(process.env.BOT_INTERVAL_MS || 2800));
export const BOT_CASH = Number(process.env.BOT_CASH || 250_000);
