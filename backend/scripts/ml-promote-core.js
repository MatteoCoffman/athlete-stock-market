#!/usr/bin/env node
/**
 * Copy the latest raw sheet rows into typed core tables.
 * Usage: npm run db:ml:promote
 *        npm run db:ml:promote -- --rebuild
 */
import { closePool } from "../src/db/ml/client.js";
import { formatReport, promoteCore } from "../src/db/ml/promoteCore.js";

const rebuild = process.argv.includes("--rebuild");
const unknown = process.argv.slice(2).filter((arg) => arg !== "--rebuild");
if (unknown.length) {
  console.error("Usage: npm run db:ml:promote [-- --rebuild]");
  process.exitCode = 1;
} else {
  try {
    const report = await promoteCore({ rebuild });
    if (rebuild) console.log("Cleared core tables before load.");
    console.log(formatReport(report));
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
