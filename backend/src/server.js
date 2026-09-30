import { createApp } from "./app.js";
import { closePool } from "./db/pg/client.js";
import { migrateUp } from "./db/pg/migrate.js";
import { startBotMarket } from "./lib/bots.js";
import { PORT } from "./lib/config.js";
import { countPricedPlayers } from "./lib/market.js";
import { playerLibrary } from "./lib/playerLibrary.js";

const app = createApp();

try {
  await migrateUp();
  const rosterCount = await playerLibrary.count({ activeOnly: true });
  if (rosterCount === 0) {
    console.warn("No roster in Postgres. Run: npm run roster && npm run import-roster && npm run seed");
  } else if ((await countPricedPlayers()) === 0) {
    console.warn("No market prices in Postgres. Run: npm run seed");
  }

  app.listen(PORT, () => {
    console.log(`Jock Exchange API listening on http://localhost:${PORT}`);
    startBotMarket().catch((err) => {
      console.error("Bot market failed to start", err);
    });
  });
} catch (err) {
  console.error(err.message || err);
  await closePool();
  process.exit(1);
}
