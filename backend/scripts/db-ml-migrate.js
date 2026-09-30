#!/usr/bin/env node
/**
 * Apply pending athlete_market_ml migrations.
 * Usage: npm run db:ml:migrate
 */
import { closePool, migrateUp } from "../src/db/ml/migrate.js";

try {
  const { appliedNow, alreadyApplied } = await migrateUp();
  if (appliedNow.length === 0) {
    console.log(`ML migrations up to date (${alreadyApplied.length} applied).`);
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
