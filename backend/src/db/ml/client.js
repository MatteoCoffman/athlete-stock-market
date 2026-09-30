/**
 * PostgreSQL pool for athlete_market_ml (raw + core research schemas).
 * Separate from athlete_market_app — never point ML_DATABASE_URL at the app DB.
 */
import "../../lib/config.js";
import pg from "pg";

const { Pool } = pg;

/** @type {import('pg').Pool | null} */
let pool = null;

export function getMlDatabaseUrl() {
  const url = process.env.ML_DATABASE_URL?.trim();
  if (!url) {
    const err = new Error(
      "ML_DATABASE_URL is not set. Copy backend/.env.example to backend/.env and set your local athlete_market_ml URL."
    );
    err.code = "ML_DATABASE_URL_MISSING";
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
    connectionString: getMlDatabaseUrl(),
    max: opts.max ?? 5,
  });
  pool.on("error", (err) => {
    console.error("Unexpected ML PostgreSQL pool error", err);
  });
  return pool;
}

/** @returns {Promise<import('pg').PoolClient>} */
export async function getClient() {
  return getPool().connect();
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
