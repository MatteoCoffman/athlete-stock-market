import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DEFAULT_DB_PATH = path.join(DATA_DIR, "jock.db");
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

let dbInstance = null;

export function getDbPath() {
  return process.env.JOCK_DB_PATH || DEFAULT_DB_PATH;
}

/**
 * @param {string} [dbPath]
 * @returns {import('node:sqlite').DatabaseSync}
 */
export function openDb(dbPath = getDbPath()) {
  if (dbInstance && dbPath === getDbPath()) {
    return dbInstance;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);

  if (dbPath === getDbPath()) {
    dbInstance = db;
  }
  return db;
}

/** @param {import('node:sqlite').DatabaseSync} db */
export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export { DATA_DIR, DEFAULT_DB_PATH };
