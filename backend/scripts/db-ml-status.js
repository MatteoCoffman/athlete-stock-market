#!/usr/bin/env node
/**
 * Show applied vs pending athlete_market_ml migrations.
 * Usage: npm run db:ml:status
 */
import { closePool, migrationStatus } from "../src/db/ml/migrate.js";

try {
  const status = await migrationStatus();
  console.log(`Host: ${status.databaseUrlHost}`);
  console.log(`Applied (${status.applied.length}):`);
  for (const v of status.applied) console.log(`  ✓ ${v}`);
  console.log(`Pending (${status.pending.length}):`);
  if (status.pending.length === 0) {
    console.log("  (none)");
  } else {
    for (const v of status.pending) console.log(`  • ${v}`);
  }
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
