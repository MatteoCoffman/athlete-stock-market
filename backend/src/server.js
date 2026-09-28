import { createApp } from "./app.js";
import { openDb } from "./db/index.js";
import { startBotMarket } from "./lib/bots.js";
import { PORT } from "./lib/config.js";
import { playerLibrary } from "./lib/playerLibrary.js";
import { loadStore } from "./lib/store.js";

openDb();
const store = loadStore();
if (playerLibrary.count({ activeOnly: true }) === 0) {
  console.warn("No roster in SQLite. Run: npm run roster && npm run import-roster && npm run seed");
} else if (Object.keys(store.players).length === 0) {
  console.warn("No market players seeded. Run: npm run seed");
}

const app = createApp();
app.listen(PORT, () => {
  console.log(`Jock Exchange API listening on http://localhost:${PORT}`);
  startBotMarket();
});
