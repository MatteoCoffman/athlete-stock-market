import { createApp } from "./app.js";
import { openDb } from "./db/index.js";
import { startBotMarket } from "./lib/bots.js";
import { PORT } from "./lib/config.js";
import { importStoreIfPresent } from "./lib/importStore.js";
import { countPricedPlayers } from "./lib/market.js";
import { playerLibrary } from "./lib/playerLibrary.js";

openDb();
const imported = importStoreIfPresent();
if (imported.imported) {
  console.log(
    `Imported store.json into jock.db (${imported.users} users, ${imported.players} players)`
  );
}

if (playerLibrary.count({ activeOnly: true }) === 0) {
  console.warn("No roster in SQLite. Run: npm run roster && npm run import-roster && npm run seed");
} else if (countPricedPlayers() === 0) {
  console.warn("No market prices in jock.db. Run: npm run seed");
}

const app = createApp();
app.listen(PORT, () => {
  console.log(`Jock Exchange API listening on http://localhost:${PORT}`);
  startBotMarket();
});
