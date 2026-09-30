/**
 * Apply ordered SQL migrations for athlete_market_ml.
 * Tracks versions in public.schema_migrations (separate DB from the app).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { closePool, getClient, getMlDatabaseUrl } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ML_MIGRATIONS_DIR = path.join(__dirname, "migrations");

function listMigrationFiles() {
  if (!fs.existsSync(ML_MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(ML_MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * @returns {Promise<{ databaseUrlHost: string, applied: string[], pending: string[] }>}
 */
export async function migrationStatus() {
  getMlDatabaseUrl();
  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query(
      "SELECT version FROM schema_migrations ORDER BY version"
    );
    const applied = rows.map((r) => r.version);
    const appliedSet = new Set(applied);
    const pending = listMigrationFiles()
      .map((f) => f.replace(/\.sql$/, ""))
      .filter((v) => !appliedSet.has(v));

    let host = "(configured)";
    try {
      host = new URL(getMlDatabaseUrl()).host;
    } catch {
      /* ignore */
    }

    return { databaseUrlHost: host, applied, pending };
  } finally {
    client.release();
  }
}

/**
 * @returns {Promise<{ appliedNow: string[], alreadyApplied: string[] }>}
 */
export async function migrateUp() {
  getMlDatabaseUrl();
  const client = await getClient();
  const appliedNow = [];

  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const appliedSet = new Set(rows.map((r) => r.version));
    const alreadyApplied = [...appliedSet].sort();

    for (const file of listMigrationFiles()) {
      const version = file.replace(/\.sql$/, "");
      if (appliedSet.has(version)) continue;

      const sql = fs.readFileSync(path.join(ML_MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        appliedNow.push(version);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    return { appliedNow, alreadyApplied };
  } finally {
    client.release();
  }
}

/**
 * LOCAL DEV ONLY: wipe athlete_market_ml schemas and re-apply migrations.
 */
export async function resetLocalDatabase() {
  const url = getMlDatabaseUrl();
  let dbName = "";
  try {
    dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    dbName = "";
  }
  if (dbName && dbName !== "athlete_market_ml") {
    const err = new Error(
      `Refusing to reset database "${dbName}". Reset is only allowed for athlete_market_ml.`
    );
    err.code = "DB_RESET_REFUSED";
    throw err;
  }

  const client = await getClient();
  try {
    await client.query("DROP SCHEMA IF EXISTS raw CASCADE");
    await client.query("DROP SCHEMA IF EXISTS core CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await client.query("GRANT ALL ON SCHEMA public TO public");
  } finally {
    client.release();
  }

  return migrateUp();
}

export { closePool };
