#!/usr/bin/env node
/**
 * Apply pending PostgreSQL migrations for athlete_market_app.
 * Usage: npm run db:migrate
 */
import { closePool, migrateUp } from "../src/db/pg/migrate.js";

try {
  const { appliedNow, alreadyApplied } = await migrateUp();
  if (appliedNow.length === 0) {
    console.log(`Migrations up to date (${alreadyApplied.length} applied).`);
  } else {
    console.log(`Applied: ${appliedNow.join(", ")}`);
    if (alreadyApplied.length) {
      console.log(`Previously applied: ${alreadyApplied.length}`);
    }
  }
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
