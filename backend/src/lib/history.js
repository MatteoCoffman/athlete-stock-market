/**
 * Build a synthetic intraday-style price series ending at `endPrice`.
 * Used so every player has a stock-like chart before real trades accumulate.
 */
export function buildPriceHistory(endPrice, points = 32) {
  const history = [];
  let price = endPrice * (0.92 + Math.random() * 0.08);
  const now = Date.now();
  const stepMs = (24 * 60 * 60 * 1000) / points;

  for (let i = 0; i < points - 1; i += 1) {
    const drift = (Math.random() - 0.48) * 0.035;
    price = Math.max(1, price * (1 + drift));
    history.push({
      t: new Date(now - (points - i) * stepMs).toISOString(),
      price: Number(price.toFixed(2)),
    });
  }

  history.push({ t: new Date(now).toISOString(), price: Number(endPrice.toFixed(2)) });
  return history;
}

export function appendPricePoint(player, price) {
  if (!Array.isArray(player.priceHistory)) player.priceHistory = [];
  player.priceHistory.push({
    t: new Date().toISOString(),
    price: Number(price.toFixed(2)),
  });
  if (player.priceHistory.length > 120) {
    player.priceHistory = player.priceHistory.slice(-120);
  }
}
