#!/usr/bin/env node
/**
 * Show applied vs pending PostgreSQL migrations.
 * Usage: npm run db:status
 */
import { closePool, migrationStatus } from "../src/db/pg/migrate.js";

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
