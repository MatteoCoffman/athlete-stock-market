/**
 * Wipe users, holdings, trades, prices, and chart history, then reseed prices
 * from the Postgres roster. Roster rows and week-stat cache stay.
 * Usage: npm run reset
 */
import { closePool } from "./db/pg/client.js";
import { clearMarketTables, withTx } from "./lib/market.js";
import { syncMarketPlayers } from "./lib/marketPlayers.js";
import { playerLibrary } from "./lib/playerLibrary.js";

try {
  if ((await playerLibrary.count({ activeOnly: true })) === 0) {
    console.warn("No players in Postgres. Run: npm run roster && npm run import-roster");
    process.exitCode = 1;
  } else {
    const { total } = await withTx(async () => {
      await clearMarketTables();
      return syncMarketPlayers({ rebuildHistory: true });
    });

    console.log(`Reset complete.
  Users: 0
  Holdings: 0
  Trades: 0
  Players: ${total} (prices reseeded, roster kept)
`);
  }
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
