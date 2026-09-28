import { PRICE_IMPACT_K } from "./config.js";
import { portfolioTotalValue, recordEquitySnapshot } from "./equity.js";
import { appendPricePoint } from "./history.js";

export function freeFloat(player) {
  return player.sharesOutstanding - player.sharesHeld;
}

export function nextPrice(player, side, qty) {
  const impact = (PRICE_IMPACT_K * qty) / player.sharesOutstanding;
  const factor = side === "buy" ? 1 + impact : 1 - impact;
  const price = Math.max(1, Number((player.price * factor).toFixed(2)));
  return price;
}

export function holdingKey(userId, playerId) {
  return `${userId}::${playerId}`;
}

export function playerPublic(player) {
  const changePct =
    player.openPrice > 0
      ? Number((((player.price - player.openPrice) / player.openPrice) * 100).toFixed(2))
      : 0;
  const history = Array.isArray(player.priceHistory) ? player.priceHistory : [];
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    price: player.price,
    openPrice: player.openPrice,
    changePct,
    sharesOutstanding: player.sharesOutstanding,
    sharesHeld: player.sharesHeld,
    freeFloat: freeFloat(player),
    performanceScore: player.performanceScore,
    priceHistory: history,
    sparkline: history.slice(-24).map((h) => h.price),
    headshotUrl: player.headshotUrl || null,
    sleeperId: player.sleeperId || null,
    gsisId: player.gsisId || null,
  };
}

export function executeTrade(store, { userId, playerId, side, qty }) {
  if (!Number.isInteger(qty) || qty <= 0) {
    const err = new Error("Quantity must be a positive integer");
    err.status = 400;
    throw err;
  }
  if (side !== "buy" && side !== "sell") {
    const err = new Error("Side must be buy or sell");
    err.status = 400;
    throw err;
  }

  const user = store.users[userId];
  const player = store.players[playerId];
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  if (!player) {
    const err = new Error("Player not found");
    err.status = 404;
    throw err;
  }

  const fillPrice = player.price;
  const cost = Number((fillPrice * qty).toFixed(2));
  const key = holdingKey(userId, playerId);
  const holding = store.holdings[key] || {
    userId,
    playerId,
    shares: 0,
    avgCost: 0,
  };

  if (side === "buy") {
    if (user.cashBalance < cost) {
      const err = new Error("Insufficient cash");
      err.status = 400;
      throw err;
    }
    if (freeFloat(player) < qty) {
      const err = new Error("Not enough free float available");
      err.status = 400;
      throw err;
    }
    const newShares = holding.shares + qty;
    holding.avgCost =
      newShares === 0
        ? 0
        : Number(((holding.avgCost * holding.shares + cost) / newShares).toFixed(4));
    holding.shares = newShares;
    user.cashBalance = Number((user.cashBalance - cost).toFixed(2));
    player.sharesHeld += qty;
  } else {
    if (holding.shares < qty) {
      const err = new Error("Insufficient shares");
      err.status = 400;
      throw err;
    }
    holding.shares -= qty;
    if (holding.shares === 0) holding.avgCost = 0;
    user.cashBalance = Number((user.cashBalance + cost).toFixed(2));
    player.sharesHeld -= qty;
  }

  player.price = nextPrice(player, side, qty);
  appendPricePoint(player, player.price);
  store.holdings[key] = holding;

  const trade = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    playerId,
    side,
    qty,
    price: fillPrice,
    ts: new Date().toISOString(),
  };
  store.trades.unshift(trade);
  store.trades = store.trades.slice(0, 500);

  recordEquitySnapshot(user, portfolioTotalValue(store, userId));

  return { trade, player: playerPublic(player), cashBalance: user.cashBalance, holding };
}

export function payDividends(store, playerId, payoutPerShare) {
  if (!(payoutPerShare > 0)) {
    const err = new Error("payoutPerShare must be positive");
    err.status = 400;
    throw err;
  }
  const player = store.players[playerId];
  if (!player) {
    const err = new Error("Player not found");
    err.status = 404;
    throw err;
  }

  const payments = [];
  for (const holding of Object.values(store.holdings)) {
    if (holding.playerId !== playerId || holding.shares <= 0) continue;
    const amount = Number((holding.shares * payoutPerShare).toFixed(2));
    const user = store.users[holding.userId];
    if (!user) continue;
    user.cashBalance = Number((user.cashBalance + amount).toFixed(2));
    payments.push({ userId: holding.userId, shares: holding.shares, amount });
  }

  player.performanceScore = Number((player.performanceScore + payoutPerShare).toFixed(2));
  return { playerId, payoutPerShare, payments, totalPaid: payments.reduce((s, p) => s + p.amount, 0) };
}
