import { openDb } from "./db/index.js";
import { payDividends } from "./lib/trading.js";

const playerId = process.argv[2];
const payout = Number(process.argv[3] || 1.5);

if (!playerId) {
  console.error("Usage: node src/pay-dividends.js <playerId> [payoutPerShare]");
  process.exit(1);
}

openDb();
const result = payDividends(playerId, payout);
console.log(JSON.stringify(result, null, 2));
