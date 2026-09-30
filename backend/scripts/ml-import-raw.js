#!/usr/bin/env node
/**
 * Append Google Sheet CSV exports into athlete_market_ml raw tables.
 * Usage: npm run db:ml:import-raw -- <directory>
 */
import { RAW_TABLES } from "../src/db/ml/tables.js";
import { closePool } from "../src/db/ml/client.js";
import { importRawDirectory } from "../src/db/ml/importRaw.js";

const dir = process.argv[2];
if (!dir || dir.startsWith("-")) {
  console.error(`Usage: npm run db:ml:import-raw -- <directory>

Export each Google Sheet tab as CSV and name the files:

  ${RAW_TABLES.map((table) => `${table}.csv`).join("\n  ")}

Headers can be snake_case or the same words with spaces ("Player ID").
Blank cells and N/A stay null. Each run appends a new import batch.`);
  process.exitCode = 1;
} else {
  try {
    const result = await importRawDirectory(dir);
    console.log(`Import batch ${result.batchId}`);
    for (const table of result.tables) {
      console.log(`  ${table.table}: ${table.inserted} row(s) from ${table.file}`);
      if (table.blank) console.log(`    skipped ${table.blank} blank row(s)`);
      if (table.unmatched.length) {
        console.log(`    ignored columns: ${table.unmatched.join(", ")}`);
      }
    }
    console.log("Next: npm run db:ml:promote");
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
