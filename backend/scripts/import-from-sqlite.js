#!/usr/bin/env node
/**
 * One-time copy of a SQLite jock.db snapshot into athlete_market_app.
 * The API does not open this file. Usage:
 *   npm run db:import-sqlite -- path/to/jock-live.db
 */
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { closePool, getPool } from "../src/db/pg/client.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run db:import-sqlite -- path/to/jock.db");
  process.exit(1);
}

function flag(value) {
  return Number(value) === 1 || value === true;
}

function rowsOf(db, sql) {
  return db.prepare(sql).all();
}

async function insertChunks(client, sqlPrefix, rows, width, mapRow) {
  const size = 300;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const params = [];
    const values = chunk.map((row, index) => {
      const mapped = mapRow(row);
      const placeholders = mapped.map((_, col) => `$${index * width + col + 1}`);
      params.push(...mapped);
      return `(${placeholders.join(", ")})`;
    });
    await client.query(`${sqlPrefix} VALUES ${values.join(", ")}`, params);
  }
}

try {
  const sqlite = new DatabaseSync(path.resolve(file), { readOnly: true });
  const players = rowsOf(
    sqlite,
    `SELECT key_id, name, team, team_abbr, position_abbr, gsis_id, sleeper_id, espn_id,
            headshot_url, opening_price, price, open_price, shares_outstanding, shares_held,
            performance_score, active, created_at, updated_at
     FROM players`
  );
  const users = rowsOf(
    sqlite,
    `SELECT id, email, password_hash, cash_balance, created_at, is_bot FROM users`
  );
  const holdings = rowsOf(
    sqlite,
    `SELECT user_id, player_id, shares, avg_cost FROM holdings`
  );
  const trades = rowsOf(
    sqlite,
    `SELECT id, user_id, player_id, side, qty, price, ts FROM trades`
  );
  const pricePoints = rowsOf(
    sqlite,
    `SELECT player_id, t, price FROM price_points`
  );
  const equityPoints = rowsOf(
    sqlite,
    `SELECT user_id, t, value FROM equity_points`
  );
  const weekStats = rowsOf(
    sqlite,
    `SELECT sleeper_id, season, week, payload_json, fetched_at FROM player_week_stats`
  );
  sqlite.close();

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM equity_points");
    await client.query("DELETE FROM trades");
    await client.query("DELETE FROM holdings");
    await client.query("DELETE FROM price_points");
    await client.query("DELETE FROM player_week_stats");
    await client.query("DELETE FROM users");
    await client.query("DELETE FROM players");

    await insertChunks(
      client,
      `INSERT INTO players (
         key_id, name, team, team_abbr, position_abbr, gsis_id, sleeper_id, espn_id,
         headshot_url, opening_price, price, open_price, shares_outstanding, shares_held,
         performance_score, active, created_at, updated_at
       )`,
      players,
      18,
      (row) => [
        row.key_id,
        row.name,
        row.team,
        row.team_abbr,
        row.position_abbr,
        row.gsis_id,
        row.sleeper_id,
        row.espn_id,
        row.headshot_url,
        row.opening_price,
        row.price,
        row.open_price,
        row.shares_outstanding ?? 10000,
        row.shares_held ?? 0,
        row.performance_score ?? 0,
        flag(row.active),
        row.created_at,
        row.updated_at,
      ]
    );

    await insertChunks(
      client,
      `INSERT INTO users (id, email, password_hash, cash_balance, created_at, is_bot)`,
      users,
      6,
      (row) => [
        row.id,
        row.email,
        row.password_hash,
        row.cash_balance,
        row.created_at,
        flag(row.is_bot),
      ]
    );

    await insertChunks(
      client,
      `INSERT INTO holdings (user_id, player_id, shares, avg_cost)`,
      holdings,
      4,
      (row) => [row.user_id, row.player_id, row.shares, row.avg_cost]
    );

    await insertChunks(
      client,
      `INSERT INTO trades (id, user_id, player_id, side, qty, price, ts)`,
      trades,
      7,
      (row) => [row.id, row.user_id, row.player_id, row.side, row.qty, row.price, row.ts]
    );

    await insertChunks(
      client,
      `INSERT INTO price_points (player_id, t, price)`,
      pricePoints,
      3,
      (row) => [row.player_id, row.t, row.price]
    );

    await insertChunks(
      client,
      `INSERT INTO equity_points (user_id, t, value)`,
      equityPoints,
      3,
      (row) => [row.user_id, row.t, row.value]
    );

    const size = 300;
    for (let i = 0; i < weekStats.length; i += size) {
      const chunk = weekStats.slice(i, i + size);
      const params = [];
      const values = chunk.map((row, index) => {
        const base = index * 5;
        params.push(row.sleeper_id, row.season, row.week, row.payload_json, row.fetched_at);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5})`;
      });
      await client.query(
        `INSERT INTO player_week_stats (sleeper_id, season, week, payload_json, fetched_at)
         VALUES ${values.join(", ")}`,
        params
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* already aborted */
    }
    throw err;
  } finally {
    client.release();
  }

  console.log(`Imported ${path.resolve(file)} into athlete_market_app`);
  console.log(`  players: ${players.length}`);
  console.log(`  users: ${users.length}`);
  console.log(`  holdings: ${holdings.length}`);
  console.log(`  trades: ${trades.length}`);
  console.log(`  price_points: ${pricePoints.length}`);
  console.log(`  equity_points: ${equityPoints.length}`);
  console.log(`  player_week_stats: ${weekStats.length}`);
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
