import { openDb } from "./db/index.js";
import { importStoreIfPresent } from "./lib/importStore.js";

openDb();
const result = importStoreIfPresent();
if (result.imported) {
  console.log(
    `[import] Copied store.json into jock.db (${result.users} users, ${result.players} players) → ${result.renamedTo}`
  );
} else {
  console.log(`[import] Skipped (${result.reason})`);
}
