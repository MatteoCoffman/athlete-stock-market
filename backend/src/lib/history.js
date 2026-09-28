/**
 * Synthetic + live price series for charts.
 * Seed spans ~1 year so 24H / 1W / 1M / 6M / 1Y ranges have something to show.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const HISTORY_SPAN_MS = 365 * DAY_MS;
export const HISTORY_MAX_POINTS = 800;

/**
 * Build a synthetic series ending at `endPrice`.
 * @param {number} endPrice
 * @param {{ points?: number, endTime?: number, startTime?: number }} [opts]
 */
export function buildPriceHistory(endPrice, opts = {}) {
  const points = opts.points ?? 180;
  const endTime = opts.endTime ?? Date.now();
  const startTime = opts.startTime ?? endTime - HISTORY_SPAN_MS;
  const span = Math.max(endTime - startTime, DAY_MS);
  const history = [];
  let price = endPrice * (0.78 + Math.random() * 0.16);
  const stepMs = span / Math.max(points - 1, 1);

  for (let i = 0; i < points - 1; i += 1) {
    // Mild drift with occasional larger swings so longer charts aren't flat noise.
    const drift = (Math.random() - 0.48) * 0.028;
    const shock = Math.random() < 0.04 ? (Math.random() - 0.5) * 0.08 : 0;
    price = Math.max(1, price * (1 + drift + shock));
    // Ease toward endPrice so the final point lands cleanly.
    const progress = (i + 1) / (points - 1);
    price = price * (1 - progress * 0.08) + endPrice * progress * 0.08;
    history.push({
      t: new Date(startTime + i * stepMs).toISOString(),
      price: Number(price.toFixed(2)),
    });
  }

  history.push({
    t: new Date(endTime).toISOString(),
    price: Number(endPrice.toFixed(2)),
  });
  return history;
}

function firstTimestamp(history) {
  if (!history?.length) return null;
  const ms = new Date(history[0].t).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Ensure history spans ~1 year without wiping live trade points.
 * Prepends a synthetic bridge when the series is too short.
 */
export function ensureLongHistory(player) {
  const hist = Array.isArray(player.priceHistory) ? player.priceHistory : [];
  const now = Date.now();
  const targetStart = now - HISTORY_SPAN_MS;

  if (hist.length < 2) {
    player.priceHistory = buildPriceHistory(player.price);
    return;
  }

  const firstT = firstTimestamp(hist);
  if (firstT == null) {
    player.priceHistory = buildPriceHistory(player.price);
    return;
  }

  // Already covers most of a year — keep live data.
  if (firstT <= targetStart + DAY_MS) {
    pruneHistory(player);
    return;
  }

  const bridge = buildPriceHistory(hist[0].price, {
    points: 120,
    startTime: targetStart,
    endTime: firstT,
  });
  player.priceHistory = [...bridge.slice(0, -1), ...hist];
  pruneHistory(player);
}

function pruneHistory(player) {
  if (!Array.isArray(player.priceHistory)) return;
  const cutoff = Date.now() - HISTORY_SPAN_MS;
  let next = player.priceHistory.filter((p) => {
    const ms = new Date(p.t).getTime();
    return !Number.isNaN(ms) && ms >= cutoff;
  });
  if (next.length > HISTORY_MAX_POINTS) {
    next = next.slice(-HISTORY_MAX_POINTS);
  }
  // Keep at least 2 points for charts.
  if (next.length < 2 && player.priceHistory.length >= 2) {
    next = player.priceHistory.slice(-2);
  }
  player.priceHistory = next;
}

export function appendPricePoint(player, price) {
  if (!Array.isArray(player.priceHistory)) player.priceHistory = [];
  player.priceHistory.push({
    t: new Date().toISOString(),
    price: Number(price.toFixed(2)),
  });
  pruneHistory(player);
}
