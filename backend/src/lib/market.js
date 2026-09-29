import { openDb } from "../db/index.js";

const TRADE_CAP = 500;
const HISTORY_IN_CHUNK = 400;

const PLAYER_COLUMNS = `
  key_id, name, team, team_abbr, position_abbr, price, open_price,
  shares_outstanding, shares_held, performance_score, gsis_id, sleeper_id, headshot_url
`;

let txDepth = 0;

/**
 * One immediate write transaction. Nested calls join the open transaction
 * so a trade and its bot setup commit or roll back together.
 */
export function withTx(fn) {
  const db = openDb();
  const outer = txDepth === 0;
  if (outer) db.exec("BEGIN IMMEDIATE");
  txDepth += 1;
  try {
    const result = fn(db);
    if (outer) db.exec("COMMIT");
    return result;
  } catch (err) {
    if (outer) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* already closed */
      }
    }
    throw err;
  } finally {
    txDepth -= 1;
  }
}

function db() {
  return openDb();
}

export function countUsers() {
  return db().prepare("SELECT COUNT(*) AS n FROM users").get().n;
}

export function countPricedPlayers() {
  return db().prepare("SELECT COUNT(*) AS n FROM players WHERE price IS NOT NULL").get().n;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    cashBalance: row.cash_balance,
    createdAt: row.created_at,
    isBot: Boolean(row.is_bot),
  };
}

function mapPlayer(row, history = []) {
  if (!row || row.price == null) return null;
  return {
    id: row.key_id,
    name: row.name,
    team: row.team_abbr,
    position: row.position_abbr,
    price: row.price,
    openPrice: row.open_price,
    sharesOutstanding: row.shares_outstanding,
    sharesHeld: row.shares_held,
    performanceScore: row.performance_score,
    gsisId: row.gsis_id || null,
    sleeperId: row.sleeper_id || null,
    headshotUrl: row.headshot_url || null,
    priceHistory: history,
  };
}

export function getUserById(id) {
  return mapUser(db().prepare("SELECT * FROM users WHERE id = ?").get(id));
}

export function getUserByEmail(email) {
  return mapUser(db().prepare("SELECT * FROM users WHERE email = ?").get(email));
}

export function insertUser(user) {
  db()
    .prepare(
      `INSERT INTO users (id, email, password_hash, cash_balance, created_at, is_bot)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      user.email,
      user.passwordHash,
      user.cashBalance,
      user.createdAt,
      user.isBot ? 1 : 0
    );
  if (Array.isArray(user.equityHistory) && user.equityHistory.length) {
    writeEquity(user.id, user.equityHistory);
  }
}

export function updateUserCash(id, cashBalance) {
  db().prepare("UPDATE users SET cash_balance = ? WHERE id = ?").run(cashBalance, id);
}

export function markUserBot(id) {
  db().prepare("UPDATE users SET is_bot = 1 WHERE id = ?").run(id);
}

export function getHolding(userId, playerId) {
  const row = db()
    .prepare("SELECT user_id, player_id, shares, avg_cost FROM holdings WHERE user_id = ? AND player_id = ?")
    .get(userId, playerId);
  if (!row) return { userId, playerId, shares: 0, avgCost: 0 };
  return {
    userId: row.user_id,
    playerId: row.player_id,
    shares: row.shares,
    avgCost: row.avg_cost,
  };
}

export function upsertHolding({ userId, playerId, shares, avgCost }) {
  db()
    .prepare(
      `INSERT INTO holdings (user_id, player_id, shares, avg_cost)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, player_id) DO UPDATE SET
         shares = excluded.shares,
         avg_cost = excluded.avg_cost`
    )
    .run(userId, playerId, shares, avgCost);
}

export function listUserHoldings(userId) {
  return db()
    .prepare(
      `SELECT user_id, player_id, shares, avg_cost
       FROM holdings WHERE user_id = ? AND shares > 0`
    )
    .all(userId)
    .map((row) => ({
      userId: row.user_id,
      playerId: row.player_id,
      shares: row.shares,
      avgCost: row.avg_cost,
    }));
}

export function listHoldingsForPlayer(playerId) {
  return db()
    .prepare(
      `SELECT user_id, player_id, shares, avg_cost
       FROM holdings WHERE player_id = ? AND shares > 0`
    )
    .all(playerId)
    .map((row) => ({
      userId: row.user_id,
      playerId: row.player_id,
      shares: row.shares,
      avgCost: row.avg_cost,
    }));
}

export function listPositiveHoldingsForUsers(userIds) {
  if (!userIds.length) return [];
  const marks = userIds.map(() => "?").join(", ");
  return db()
    .prepare(
      `SELECT user_id, player_id, shares, avg_cost
       FROM holdings
       WHERE shares > 0 AND user_id IN (${marks})`
    )
    .all(...userIds)
    .map((row) => ({
      userId: row.user_id,
      playerId: row.player_id,
      shares: row.shares,
      avgCost: row.avg_cost,
    }));
}

export function positionsMarketValue(userId) {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(h.shares * p.price), 0) AS value
       FROM holdings h
       JOIN players p ON p.key_id = h.player_id
       WHERE h.user_id = ? AND h.shares > 0`
    )
    .get(userId);
  return row?.value ?? 0;
}

export function insertTrade(trade, { cap = true } = {}) {
  db()
    .prepare(
      `INSERT INTO trades (id, user_id, player_id, side, qty, price, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(trade.id, trade.userId, trade.playerId, trade.side, trade.qty, trade.price, trade.ts);
  if (cap) capTrades();
}

export function capTrades() {
  db()
    .prepare(
      `DELETE FROM trades WHERE rowid NOT IN (
         SELECT rowid FROM trades ORDER BY ts DESC, rowid DESC LIMIT ?
       )`
    )
    .run(TRADE_CAP);
}

export function recentTrades(playerId, limit = 30) {
  return db()
    .prepare(
      `SELECT id, side, qty, price, ts
       FROM trades WHERE player_id = ?
       ORDER BY ts DESC, rowid DESC
       LIMIT ?`
    )
    .all(playerId, limit);
}

function normalizePoints(points, valueKey) {
  const out = [];
  let lastMs = -Infinity;
  for (const point of points) {
    let ms = Date.parse(point.t);
    if (!Number.isFinite(ms)) ms = Date.now();
    if (ms <= lastMs) ms = lastMs + 1;
    lastMs = ms;
    out.push({ t: new Date(ms).toISOString(), [valueKey]: Number(point[valueKey]) });
  }
  return out;
}

export function readPriceHistory(playerId) {
  return db()
    .prepare("SELECT t, price FROM price_points WHERE player_id = ? ORDER BY t")
    .all(playerId)
    .map((row) => ({ t: row.t, price: row.price }));
}

export function readPriceHistories(playerIds) {
  const map = new Map();
  if (!playerIds.length) return map;
  for (let i = 0; i < playerIds.length; i += HISTORY_IN_CHUNK) {
    const chunk = playerIds.slice(i, i + HISTORY_IN_CHUNK);
    const marks = chunk.map(() => "?").join(", ");
    const rows = db()
      .prepare(
        `SELECT player_id, t, price FROM price_points
         WHERE player_id IN (${marks})
         ORDER BY player_id, t`
      )
      .all(...chunk);
    for (const row of rows) {
      let series = map.get(row.player_id);
      if (!series) {
        series = [];
        map.set(row.player_id, series);
      }
      series.push({ t: row.t, price: row.price });
    }
  }
  return map;
}

export function writePriceHistory(playerId, points) {
  const series = normalizePoints(points, "price");
  const conn = db();
  conn.prepare("DELETE FROM price_points WHERE player_id = ?").run(playerId);
  const insert = conn.prepare("INSERT INTO price_points (player_id, t, price) VALUES (?, ?, ?)");
  for (const point of series) insert.run(playerId, point.t, point.price);
}

export function readEquity(userId) {
  return db()
    .prepare("SELECT t, value FROM equity_points WHERE user_id = ? ORDER BY t")
    .all(userId)
    .map((row) => ({ t: row.t, value: row.value }));
}

export function writeEquity(userId, points) {
  const series = normalizePoints(points, "value");
  const conn = db();
  conn.prepare("DELETE FROM equity_points WHERE user_id = ?").run(userId);
  const insert = conn.prepare("INSERT INTO equity_points (user_id, t, value) VALUES (?, ?, ?)");
  for (const point of series) insert.run(userId, point.t, point.value);
}

export function getPricedPlayer(id) {
  const row = db().prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE key_id = ?`).get(id);
  if (!row || row.price == null) return null;
  return mapPlayer(row, readPriceHistory(id));
}

export function listPricedPlayers() {
  return db()
    .prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE price IS NOT NULL AND active = 1`)
    .all()
    .map((row) => mapPlayer(row, []));
}

export function listPricedPlayersByIds(ids) {
  if (!ids.length) return [];
  const histories = readPriceHistories(ids);
  const rows = [];
  for (let i = 0; i < ids.length; i += HISTORY_IN_CHUNK) {
    const chunk = ids.slice(i, i + HISTORY_IN_CHUNK);
    const marks = chunk.map(() => "?").join(", ");
    rows.push(
      ...db()
        .prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE key_id IN (${marks})`)
        .all(...chunk)
    );
  }
  return rows.map((row) => mapPlayer(row, histories.get(row.key_id) || []));
}

export function getPlayerIdentity(id) {
  const row = db()
    .prepare(
      `SELECT key_id, name, team, team_abbr, position_abbr, sleeper_id, headshot_url
       FROM players WHERE key_id = ?`
    )
    .get(id);
  if (!row) return null;
  return {
    keyId: row.key_id,
    name: row.name,
    team: row.team,
    teamAbbr: row.team_abbr,
    positionAbbr: row.position_abbr,
    sleeperId: row.sleeper_id || null,
    headshotUrl: row.headshot_url || null,
  };
}

export function playerPrice(id) {
  const row = db().prepare("SELECT price FROM players WHERE key_id = ?").get(id);
  return row ? row.price : undefined;
}

export function writePlayerMarket(keyId, fields) {
  const current = db()
    .prepare(
      `SELECT price, open_price, shares_outstanding, shares_held, performance_score
       FROM players WHERE key_id = ?`
    )
    .get(keyId);
  if (!current) {
    const err = new Error("Player not found");
    err.status = 404;
    throw err;
  }
  const price = fields.price !== undefined ? fields.price : current.price;
  const openPrice = fields.openPrice !== undefined ? fields.openPrice : current.open_price;
  const sharesOutstanding =
    fields.sharesOutstanding !== undefined ? fields.sharesOutstanding : current.shares_outstanding;
  const sharesHeld = fields.sharesHeld !== undefined ? fields.sharesHeld : current.shares_held;
  const performanceScore =
    fields.performanceScore !== undefined ? fields.performanceScore : current.performance_score;
  db()
    .prepare(
      `UPDATE players
       SET price = ?, open_price = ?, shares_outstanding = ?, shares_held = ?, performance_score = ?
       WHERE key_id = ?`
    )
    .run(price, openPrice, sharesOutstanding, sharesHeld, performanceScore, keyId);
  if (fields.history) writePriceHistory(keyId, fields.history);
}

export function insertBarePlayer(player) {
  const team = player.team || "FA";
  const position = player.position || "UNK";
  db()
    .prepare(
      `INSERT OR IGNORE INTO players (
         key_id, name, team, team_abbr, position_abbr, gsis_id, sleeper_id, headshot_url, opening_price, active
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      player.id,
      player.name || player.id,
      team,
      team,
      position,
      player.gsisId || null,
      player.sleeperId || null,
      player.headshotUrl || null,
      player.openPrice ?? player.price ?? null
    );
}

export function resetOpenPrices() {
  db().exec("UPDATE players SET open_price = price WHERE price IS NOT NULL");
}

export function setPerformanceScore(playerId, performanceScore) {
  const info = db()
    .prepare("UPDATE players SET performance_score = ? WHERE key_id = ? AND price IS NOT NULL")
    .run(performanceScore, playerId);
  if (!info.changes) return null;
  return getPricedPlayer(playerId);
}

/**
 * Wipe accounts, holdings, trades, prices, and chart history.
 * Roster rows and week-stat cache stay.
 */
export function clearMarketTables() {
  const conn = db();
  conn.exec("DELETE FROM equity_points");
  conn.exec("DELETE FROM trades");
  conn.exec("DELETE FROM holdings");
  conn.exec("DELETE FROM price_points");
  conn.exec("DELETE FROM users");
  conn.exec(
    `UPDATE players
     SET price = NULL, open_price = NULL, shares_held = 0, performance_score = 0, shares_outstanding = 10000`
  );
}
