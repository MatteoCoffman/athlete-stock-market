import { createApp } from "./app.js";
import { startBotMarket } from "./lib/bots.js";
import { PORT } from "./lib/config.js";
import { loadStore } from "./lib/store.js";

const store = loadStore();
if (Object.keys(store.players).length === 0) {
  console.warn("No players seeded. Run: npm run seed");
}

const app = createApp();
app.listen(PORT, () => {
  console.log(`Jock Exchange API listening on http://localhost:${PORT}`);
  startBotMarket();
});
