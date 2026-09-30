#!/usr/bin/env node
/**
 * Verify ML_DATABASE_URL connectivity (athlete_market_ml).
 * Usage: npm run db:ml:ping
 */
import { closePool, pingDatabase } from "../src/db/ml/client.js";

try {
  const row = await pingDatabase();
  console.log(
    `Connected to database "${row.database}" as "${row.user}" at ${row.now.toISOString?.() ?? row.now}`
  );
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
