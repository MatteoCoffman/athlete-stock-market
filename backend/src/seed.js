import { closePool } from "./db/pg/client.js";
import { backfillLongHistories, syncMarketPlayers } from "./lib/marketPlayers.js";
import { playerLibrary } from "./lib/playerLibrary.js";

try {
  if ((await playerLibrary.count({ activeOnly: true })) === 0) {
    console.warn("No players in Postgres. Run: npm run roster && npm run import-roster");
    process.exitCode = 1;
  } else {
    const { added, total } = await syncMarketPlayers();
    const updated = await backfillLongHistories();
    console.log(`Seed complete. Added ${added}, backfilled history on ${updated}. Total: ${total}`);
  }
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
