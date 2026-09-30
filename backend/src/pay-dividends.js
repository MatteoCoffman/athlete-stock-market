import { closePool } from "./db/pg/client.js";
import { payDividends } from "./lib/trading.js";

const playerId = process.argv[2];
const payout = Number(process.argv[3] || 1.5);

if (!playerId) {
  console.error("Usage: node src/pay-dividends.js <playerId> [payoutPerShare]");
  process.exit(1);
}

try {
  const result = await payDividends(playerId, payout);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
