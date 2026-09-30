import { iso, query, queryOne, queryRows, withTx } from "../db/pg/client.js";

const TRADE_CAP = 500;
const HISTORY_IN_CHUNK = 400;

const PLAYER_COLUMNS = `
  key_id, name, team, team_abbr, position_abbr, price, open_price,
  shares_outstanding, shares_held, performance_score, gsis_id, sleeper_id, headshot_url
`;

export { withTx };

function num(value) {
  if (value == null) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    cashBalance: num(row.cash_balance),
    createdAt: iso(row.created_at),
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
    price: num(row.price),
    openPrice: num(row.open_price),
    sharesOutstanding: num(row.shares_outstanding),
    sharesHeld: num(row.shares_held),
    performanceScore: num(row.performance_score),
    gsisId: row.gsis_id || null,
    sleeperId: row.sleeper_id || null,
    headshotUrl: row.headshot_url || null,
    priceHistory: history,
  };
}

function mapHolding(row) {
  return {
    userId: row.user_id,
    playerId: row.player_id,
    shares: num(row.shares),
    avgCost: num(row.avg_cost),
  };
}

function mapPoint(row, valueKey) {
  return { t: iso(row.t), [valueKey]: num(row[valueKey]) };
}

export async function countUsers() {
  const row = await queryOne("SELECT COUNT(*)::int AS n FROM users");
  return row?.n ?? 0;
}

export async function countPricedPlayers() {
  const row = await queryOne("SELECT COUNT(*)::int AS n FROM players WHERE price IS NOT NULL");
  return row?.n ?? 0;
}

export async function listPricedPlayerIds() {
  const rows = await queryRows("SELECT key_id FROM players WHERE price IS NOT NULL");
  return rows.map((row) => row.key_id);
}

/**
 * @param {string} id
 * @param {{ forUpdate?: boolean }} [opts]
 */
export async function getUserById(id, { forUpdate = false } = {}) {
  const lock = forUpdate ? " FOR UPDATE" : "";
  return mapUser(await queryOne(`SELECT * FROM users WHERE id = $1${lock}`, [id]));
}

export async function getUserByEmail(email) {
  return mapUser(await queryOne("SELECT * FROM users WHERE email = $1", [email]));
}

export async function insertUser(user) {
  await query(
    `INSERT INTO users (id, email, password_hash, cash_balance, created_at, is_bot)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, user.email, user.passwordHash, user.cashBalance, user.createdAt, Boolean(user.isBot)]
  );
  if (Array.isArray(user.equityHistory) && user.equityHistory.length) {
    await writeEquity(user.id, user.equityHistory);
  }
}

export async function updateUserCash(id, cashBalance) {
  await query("UPDATE users SET cash_balance = $1 WHERE id = $2", [cashBalance, id]);
}

export async function markUserBot(id) {
  await query("UPDATE users SET is_bot = true WHERE id = $1", [id]);
}

export async function getHolding(userId, playerId) {
  const row = await queryOne(
    "SELECT user_id, player_id, shares, avg_cost FROM holdings WHERE user_id = $1 AND player_id = $2",
    [userId, playerId]
  );
  if (!row) return { userId, playerId, shares: 0, avgCost: 0 };
  return mapHolding(row);
}

export async function upsertHolding({ userId, playerId, shares, avgCost }) {
  await query(
    `INSERT INTO holdings (user_id, player_id, shares, avg_cost)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, player_id) DO UPDATE SET
       shares = EXCLUDED.shares,
       avg_cost = EXCLUDED.avg_cost`,
    [userId, playerId, shares, avgCost]
  );
}

export async function listUserHoldings(userId) {
  const rows = await queryRows(
    `SELECT user_id, player_id, shares, avg_cost
     FROM holdings WHERE user_id = $1 AND shares > 0`,
    [userId]
  );
  return rows.map(mapHolding);
}

export async function listHoldingsForPlayer(playerId) {
  const rows = await queryRows(
    `SELECT user_id, player_id, shares, avg_cost
     FROM holdings WHERE player_id = $1 AND shares > 0`,
    [playerId]
  );
  return rows.map(mapHolding);
}

export async function listPositiveHoldingsForUsers(userIds) {
  if (!userIds.length) return [];
  const rows = await queryRows(
    `SELECT user_id, player_id, shares, avg_cost
     FROM holdings
     WHERE shares > 0 AND user_id = ANY($1::text[])`,
    [userIds]
  );
  return rows.map(mapHolding);
}

export async function positionsMarketValue(userId) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(h.shares * p.price), 0) AS value
     FROM holdings h
     JOIN players p ON p.key_id = h.player_id
     WHERE h.user_id = $1 AND h.shares > 0`,
    [userId]
  );
  return num(row?.value) ?? 0;
}

export async function insertTrade(trade, { cap = true } = {}) {
  await query(
    `INSERT INTO trades (id, user_id, player_id, side, qty, price, ts)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [trade.id, trade.userId, trade.playerId, trade.side, trade.qty, trade.price, trade.ts]
  );
  if (cap) await capTrades();
}

export async function capTrades() {
  await query(
    `DELETE FROM trades WHERE id NOT IN (
       SELECT id FROM trades ORDER BY ts DESC, id DESC LIMIT $1
     )`,
    [TRADE_CAP]
  );
}

export async function recentTrades(playerId, limit = 30) {
  const rows = await queryRows(
    `SELECT id, side, qty, price, ts
     FROM trades WHERE player_id = $1
     ORDER BY ts DESC, id DESC
     LIMIT $2`,
    [playerId, limit]
  );
  return rows.map((row) => ({
    id: row.id,
    side: row.side,
    qty: num(row.qty),
    price: num(row.price),
    ts: iso(row.ts),
  }));
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

export async function readPriceHistory(playerId) {
  const rows = await queryRows(
    "SELECT t, price FROM price_points WHERE player_id = $1 ORDER BY t",
    [playerId]
  );
  return rows.map((row) => mapPoint(row, "price"));
}

export async function readPriceHistories(playerIds) {
  const map = new Map();
  if (!playerIds.length) return map;
  for (let i = 0; i < playerIds.length; i += HISTORY_IN_CHUNK) {
    const chunk = playerIds.slice(i, i + HISTORY_IN_CHUNK);
    const rows = await queryRows(
      `SELECT player_id, t, price FROM price_points
       WHERE player_id = ANY($1::text[])
       ORDER BY player_id, t`,
      [chunk]
    );
    for (const row of rows) {
      let series = map.get(row.player_id);
      if (!series) {
        series = [];
        map.set(row.player_id, series);
      }
      series.push(mapPoint(row, "price"));
    }
  }
  return map;
}

async function insertSeries(table, idColumn, id, points, valueKey) {
  const chunkSize = 200;
  for (let i = 0; i < points.length; i += chunkSize) {
    const chunk = points.slice(i, i + chunkSize);
    const params = [];
    const values = chunk.map((point, index) => {
      const base = index * 3;
      params.push(id, point.t, point[valueKey]);
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    });
    await query(
      `INSERT INTO ${table} (${idColumn}, t, ${valueKey}) VALUES ${values.join(", ")}`,
      params
    );
  }
}

export async function writePriceHistory(playerId, points) {
  const series = normalizePoints(points, "price");
  await query("DELETE FROM price_points WHERE player_id = $1", [playerId]);
  await insertSeries("price_points", "player_id", playerId, series, "price");
}

export async function readEquity(userId) {
  const rows = await queryRows(
    "SELECT t, value FROM equity_points WHERE user_id = $1 ORDER BY t",
    [userId]
  );
  return rows.map((row) => mapPoint(row, "value"));
}

export async function writeEquity(userId, points) {
  const series = normalizePoints(points, "value");
  await query("DELETE FROM equity_points WHERE user_id = $1", [userId]);
  await insertSeries("equity_points", "user_id", userId, series, "value");
}

/**
 * @param {string} id
 * @param {{ forUpdate?: boolean }} [opts]
 */
export async function getPricedPlayer(id, { forUpdate = false } = {}) {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const row = await queryOne(`SELECT ${PLAYER_COLUMNS} FROM players WHERE key_id = $1${lock}`, [id]);
  if (!row || row.price == null) return null;
  return mapPlayer(row, await readPriceHistory(id));
}

export async function listPricedPlayers() {
  const rows = await queryRows(
    `SELECT ${PLAYER_COLUMNS} FROM players WHERE price IS NOT NULL AND active = true`
  );
  return rows.map((row) => mapPlayer(row, []));
}

export async function listPricedPlayersByIds(ids) {
  if (!ids.length) return [];
  const histories = await readPriceHistories(ids);
  const rows = [];
  for (let i = 0; i < ids.length; i += HISTORY_IN_CHUNK) {
    const chunk = ids.slice(i, i + HISTORY_IN_CHUNK);
    rows.push(
      ...(await queryRows(`SELECT ${PLAYER_COLUMNS} FROM players WHERE key_id = ANY($1::text[])`, [
        chunk,
      ]))
    );
  }
  return rows.map((row) => mapPlayer(row, histories.get(row.key_id) || []));
}

export async function getPlayerIdentity(id) {
  const row = await queryOne(
    `SELECT key_id, name, team, team_abbr, position_abbr, sleeper_id, headshot_url
     FROM players WHERE key_id = $1`,
    [id]
  );
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

export async function playerPrice(id) {
  const row = await queryOne("SELECT price FROM players WHERE key_id = $1", [id]);
  if (!row) return undefined;
  return row.price == null ? null : num(row.price);
}

export async function writePlayerMarket(keyId, fields) {
  const current = await queryOne(
    `SELECT price, open_price, shares_outstanding, shares_held, performance_score
     FROM players WHERE key_id = $1`,
    [keyId]
  );
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
  await query(
    `UPDATE players
     SET price = $1, open_price = $2, shares_outstanding = $3, shares_held = $4,
         performance_score = $5, updated_at = now()
     WHERE key_id = $6`,
    [price, openPrice, sharesOutstanding, sharesHeld, performanceScore, keyId]
  );
  if (fields.history) await writePriceHistory(keyId, fields.history);
}

export async function insertBarePlayer(player) {
  const team = player.team || "FA";
  const position = player.position || "UNK";
  await query(
    `INSERT INTO players (
       key_id, name, team, team_abbr, position_abbr, gsis_id, sleeper_id, headshot_url, opening_price, active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
     ON CONFLICT (key_id) DO NOTHING`,
    [
      player.id,
      player.name || player.id,
      team,
      team,
      position,
      player.gsisId || null,
      player.sleeperId || null,
      player.headshotUrl || null,
      player.openPrice ?? player.price ?? null,
    ]
  );
}

export async function resetOpenPrices() {
  await query("UPDATE players SET open_price = price WHERE price IS NOT NULL");
}

export async function setPerformanceScore(playerId, performanceScore) {
  const result = await query(
    "UPDATE players SET performance_score = $1, updated_at = now() WHERE key_id = $2 AND price IS NOT NULL",
    [performanceScore, playerId]
  );
  if (!result.rowCount) return null;
  return getPricedPlayer(playerId);
}

/**
 * Wipe accounts, holdings, trades, prices, and chart history.
 * Roster rows and week-stat cache stay.
 */
export async function clearMarketTables() {
  await query("DELETE FROM equity_points");
  await query("DELETE FROM trades");
  await query("DELETE FROM holdings");
  await query("DELETE FROM price_points");
  await query("DELETE FROM users");
  await query(
    `UPDATE players
     SET price = NULL, open_price = NULL, shares_held = 0, performance_score = 0,
         shares_outstanding = 10000, updated_at = now()`
  );
}
