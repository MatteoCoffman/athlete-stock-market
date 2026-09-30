#!/usr/bin/env node
/**
 * LOCAL DEV ONLY: wipe athlete_market_ml and re-apply migrations.
 * Usage: npm run db:ml:reset
 */
import { closePool, resetLocalDatabase } from "../src/db/ml/migrate.js";

try {
  const { appliedNow } = await resetLocalDatabase();
  console.log(
    `Local athlete_market_ml reset. Applied: ${appliedNow.join(", ") || "(none)"}`
  );
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
