/**
 * Wipe users, holdings, trades, prices, and chart history, then reseed prices
 * from the SQL roster. Roster rows and week-stat cache stay.
 * Usage: npm run reset
 */
import { openDb } from "./db/index.js";
import { clearMarketTables, withTx } from "./lib/market.js";
import { syncMarketPlayers } from "./lib/marketPlayers.js";
import { playerLibrary } from "./lib/playerLibrary.js";

openDb();

if (playerLibrary.count({ activeOnly: true }) === 0) {
  console.warn("No players in SQLite. Run: npm run roster && npm run import-roster");
  process.exit(1);
}

const { total } = withTx(() => {
  clearMarketTables();
  return syncMarketPlayers({ rebuildHistory: true });
});

console.log(`Reset complete.
  Users: 0
  Holdings: 0
  Trades: 0
  Players: ${total} (prices reseeded, roster kept)
`);
