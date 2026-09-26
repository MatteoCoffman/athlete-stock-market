export const STARTING_CASH = 100_000;
export const SHARES_OUTSTANDING = 10_000;
export const PRICE_IMPACT_K = 0.12;
export const JWT_SECRET = process.env.JWT_SECRET || "jock-exchange-dev-secret";
export const PORT = Number(process.env.PORT || 4000);
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "jock-admin-demo";

/** Simulated market makers — off with BOTS_ENABLED=0 */
export const BOTS_ENABLED = process.env.BOTS_ENABLED !== "0";
export const BOT_COUNT = Math.max(1, Number(process.env.BOT_COUNT || 12));
export const BOT_INTERVAL_MS = Math.max(800, Number(process.env.BOT_INTERVAL_MS || 2800));
export const BOT_CASH = Number(process.env.BOT_CASH || 250_000);
