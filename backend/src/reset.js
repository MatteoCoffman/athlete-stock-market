/**
 * Full wipe: users, holdings, trades, players — then reseed from SQL roster.
 * Usage: npm run reset
 */
import { openDb } from "./db/index.js";
import { syncMarketPlayers } from "./lib/marketPlayers.js";
import { playerLibrary } from "./lib/playerLibrary.js";
import { saveStore } from "./lib/store.js";

openDb();

if (playerLibrary.count({ activeOnly: true }) === 0) {
  console.warn("No players in SQLite. Run: npm run roster && npm run import-roster");
  process.exit(1);
}

const store = {
  users: {},
  players: {},
  holdings: {},
  trades: [],
};

const { total } = syncMarketPlayers(store, { rebuildHistory: true });
saveStore(store);

console.log(`Reset complete.
  Users: 0
  Holdings: 0
  Trades: 0
  Players: ${total} (from SQL roster)
`);
