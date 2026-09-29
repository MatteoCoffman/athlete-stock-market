import { openDb } from "./db/index.js";
import { backfillLongHistories, syncMarketPlayers } from "./lib/marketPlayers.js";
import { playerLibrary } from "./lib/playerLibrary.js";

openDb();

if (playerLibrary.count({ activeOnly: true }) === 0) {
  console.warn("No players in SQLite. Run: npm run roster && npm run import-roster");
  process.exit(1);
}

const { added, total } = syncMarketPlayers();
const updated = backfillLongHistories();
console.log(`Seed complete. Added ${added}, backfilled history on ${updated}. Total: ${total}`);
