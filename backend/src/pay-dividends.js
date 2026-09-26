import { payDividends } from "./lib/trading.js";
import { withStore } from "./lib/store.js";

const playerId = process.argv[2];
const payout = Number(process.argv[3] || 1.5);

if (!playerId) {
  console.error("Usage: node src/pay-dividends.js <playerId> [payoutPerShare]");
  process.exit(1);
}

const result = withStore((store) => payDividends(store, playerId, payout));
console.log(JSON.stringify(result, null, 2));
