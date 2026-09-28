import { STARTING_CASH } from "./config.js";

const SNAPSHOT_MIN_MS = 60_000;
const MAX_POINTS = 2500;

export function positionsMarketValue(store, userId) {
  return Object.values(store.holdings)
    .filter((h) => h.userId === userId && h.shares > 0)
    .reduce((sum, h) => {
      const player = store.players[h.playerId];
      if (!player) return sum;
      return sum + player.price * h.shares;
    }, 0);
}

export function portfolioTotalValue(store, userId) {
  const user = store.users[userId];
  if (!user) return 0;
  return Number((user.cashBalance + positionsMarketValue(store, userId)).toFixed(2));
}

/**
 * Append / refresh equity curve for a user. Mutates user.equityHistory.
 * @param {object} user
 * @param {number} currentValue
 */
export function recordEquitySnapshot(user, currentValue) {
  const value = Number(Number(currentValue).toFixed(2));
  const nowIso = new Date().toISOString();

  if (!Array.isArray(user.equityHistory) || user.equityHistory.length === 0) {
    const startIso = user.createdAt || nowIso;
    user.equityHistory = [{ t: startIso, value: STARTING_CASH }];
    if (Date.parse(startIso) < Date.now() - 1000) {
      user.equityHistory.push({ t: nowIso, value });
    } else {
      user.equityHistory[0] = { t: nowIso, value };
    }
    return user.equityHistory;
  }

  const last = user.equityHistory[user.equityHistory.length - 1];
  const lastMs = Date.parse(last.t);
  const now = Date.now();
  if (Number.isFinite(lastMs) && now - lastMs < SNAPSHOT_MIN_MS) {
    last.value = value;
    last.t = nowIso;
  } else {
    user.equityHistory.push({ t: nowIso, value });
  }

  if (user.equityHistory.length > MAX_POINTS) {
    user.equityHistory = user.equityHistory.slice(-MAX_POINTS);
  }
  return user.equityHistory;
}

/**
 * % change vs value ~24h ago (or earliest point if history is shorter).
 * @param {Array<{ t: string, value: number }>} history
 * @param {number} currentValue
 */
export function dayChangePct(history, currentValue) {
  const series = Array.isArray(history) ? history : [];
  if (series.length === 0 || !(currentValue > 0)) return 0;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let baseline = series[0].value;
  for (const pt of series) {
    const ms = Date.parse(pt.t);
    if (!Number.isFinite(ms)) continue;
    if (ms <= cutoff) baseline = pt.value;
    else break;
  }

  if (!(baseline > 0)) return 0;
  return Number((((currentValue - baseline) / baseline) * 100).toFixed(2));
}

/** Map equity history to chart series shape `{ t, price }`. */
export function equityChartSeries(history) {
  return (Array.isArray(history) ? history : []).map((p) => ({
    t: p.t,
    price: p.value,
  }));
}
