#!/usr/bin/env node
/**
 * LOCAL DEV ONLY: wipe athlete_market_app public schema and re-apply migrations.
 * Usage: npm run db:reset
 *
 * Does not touch athlete_market_ml.
 */
import { closePool, resetLocalDatabase } from "../src/db/pg/migrate.js";

try {
  const { appliedNow } = await resetLocalDatabase();
  console.log(`Local athlete_market_app reset. Applied: ${appliedNow.join(", ") || "(none)"}`);
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
