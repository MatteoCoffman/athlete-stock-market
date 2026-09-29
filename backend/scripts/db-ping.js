#!/usr/bin/env node
/**
 * Verify DATABASE_URL connectivity.
 * Usage: npm run db:ping
 */
import { closePool, pingDatabase } from "../src/db/pg/client.js";

try {
  const row = await pingDatabase();
  console.log(`Connected to database "${row.database}" as "${row.user}" at ${row.now.toISOString?.() ?? row.now}`);
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
