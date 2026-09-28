import { openDb } from "./db/index.js";
import { ensureLongHistory } from "./lib/history.js";
import { syncMarketPlayers } from "./lib/marketPlayers.js";
import { playerLibrary } from "./lib/playerLibrary.js";
import { loadStore, saveStore } from "./lib/store.js";

openDb();

if (playerLibrary.count({ activeOnly: true }) === 0) {
  console.warn("No players in SQLite. Run: npm run roster && npm run import-roster");
  process.exit(1);
}

const store = loadStore();
const { added } = syncMarketPlayers(store);

let updated = 0;
for (const player of Object.values(store.players)) {
  const before = player.priceHistory?.length ?? 0;
  ensureLongHistory(player);
  if ((player.priceHistory?.length ?? 0) !== before) updated += 1;
}

saveStore(store);
console.log(
  `Seed complete. Added ${added}, backfilled history on ${updated}. Total: ${Object.keys(store.players).length}`
);
