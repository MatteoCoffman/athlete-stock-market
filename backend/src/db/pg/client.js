/**
 * PostgreSQL pool for athlete_market_app.
 * Market, auth, roster, and stats all go through this pool.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import "../../lib/config.js";
import pg from "pg";

const { Pool, types } = pg;

// NUMERIC arrives as text. The market math uses JS numbers, same as SQLite REAL.
types.setTypeParser(1700, (value) => (value == null ? null : Number(value)));

const txStorage = new AsyncLocalStorage();

/** @type {import('pg').Pool | null} */
let pool = null;

export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    const err = new Error(
      "DATABASE_URL is not set. Copy backend/.env.example to backend/.env and set your local Postgres URL."
    );
    err.code = "DATABASE_URL_MISSING";
    throw err;
  }
  return url;
}

/**
 * @param {{ max?: number }} [opts]
 * @returns {import('pg').Pool}
 */
export function getPool(opts = {}) {
  if (pool) return pool;
  pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: opts.max ?? 10,
  });
  pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error", err);
  });
  return pool;
}

/** @returns {Promise<import('pg').PoolClient>} */
export async function getClient() {
  return getPool().connect();
}

/**
 * Query on the open transaction when one exists, otherwise on the pool.
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params = []) {
  const client = txStorage.getStore();
  if (client) return client.query(text, params);
  return getPool().query(text, params);
}

/** @param {string} text @param {unknown[]} [params] */
export async function queryRows(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

/** @param {string} text @param {unknown[]} [params] */
export async function queryOne(text, params = []) {
  const rows = await queryRows(text, params);
  return rows[0] ?? null;
}

/** Timestamps from Postgres are Date objects. The API sends ISO strings. */
export function iso(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const ms = Date.parse(String(value));
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return String(value);
}

/**
 * One write transaction. Nested calls join the open transaction
 * so a trade and its bot setup commit or roll back together.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTx(fn) {
  if (txStorage.getStore()) return fn(txStorage.getStore());
  return runTx(fn, 1);
}

/**
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @param {number} attemptsLeft
 * @returns {Promise<T>}
 */
async function runTx(fn, attemptsLeft) {
  const client = await getPool().connect();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    client.release();
  };
  try {
    await client.query("BEGIN");
    const result = await txStorage.run(client, () => fn(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* already aborted */
    }
    if (err && err.code === "40P01" && attemptsLeft > 0) {
      release();
      return runTx(fn, attemptsLeft - 1);
    }
    throw err;
  } finally {
    release();
  }
}

/** Verify connectivity. Throws on failure. */
export async function pingDatabase() {
  const client = await getClient();
  try {
    const result = await client.query(
      "SELECT current_database() AS database, current_user AS user, now() AS now"
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
