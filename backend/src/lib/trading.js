import { PRICE_IMPACT_K } from "./config.js";
import { recordEquitySnapshot } from "./equity.js";
import { appendPricePoint } from "./history.js";
import {
  getHolding,
  getPricedPlayer,
  getUserById,
  insertTrade,
  listHoldingsForPlayer,
  positionsMarketValue,
  readEquity,
  updateUserCash,
  upsertHolding,
  withTx,
  writeEquity,
  writePlayerMarket,
  writePriceHistory,
} from "./market.js";

export function freeFloat(player) {
  return player.sharesOutstanding - player.sharesHeld;
}

export function nextPrice(player, side, qty) {
  const impact = (PRICE_IMPACT_K * qty) / player.sharesOutstanding;
  const factor = side === "buy" ? 1 + impact : 1 - impact;
  const price = Math.max(1, Number((player.price * factor).toFixed(2)));
  return price;
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

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function executeTrade({ userId, playerId, side, qty }) {
  if (!Number.isInteger(qty) || qty <= 0) throw httpError("Quantity must be a positive integer", 400);
  if (side !== "buy" && side !== "sell") throw httpError("Side must be buy or sell", 400);

  return withTx(async () => {
    // Lock the player first, then the user, so trades and dividends take locks in the same order.
    const player = await getPricedPlayer(playerId, { forUpdate: true });
    const user = await getUserById(userId, { forUpdate: true });
    if (!user) throw httpError("User not found", 404);
    if (!player) throw httpError("Player not found", 404);

    const fillPrice = player.price;
    const cost = Number((fillPrice * qty).toFixed(2));
    const holding = await getHolding(userId, playerId);

    if (side === "buy") {
      if (user.cashBalance < cost) throw httpError("Insufficient cash", 400);
      if (freeFloat(player) < qty) throw httpError("Not enough free float available", 400);
      const newShares = holding.shares + qty;
      holding.avgCost =
        newShares === 0
          ? 0
          : Number(((holding.avgCost * holding.shares + cost) / newShares).toFixed(4));
      holding.shares = newShares;
      user.cashBalance = Number((user.cashBalance - cost).toFixed(2));
      player.sharesHeld += qty;
    } else {
      if (holding.shares < qty) throw httpError("Insufficient shares", 400);
      holding.shares -= qty;
      if (holding.shares === 0) holding.avgCost = 0;
      user.cashBalance = Number((user.cashBalance + cost).toFixed(2));
      player.sharesHeld -= qty;
    }

    player.price = nextPrice(player, side, qty);
    appendPricePoint(player, player.price);

    await updateUserCash(userId, user.cashBalance);
    await upsertHolding(holding);
    await writePlayerMarket(playerId, { price: player.price, sharesHeld: player.sharesHeld });
    await writePriceHistory(playerId, player.priceHistory);

    const trade = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      playerId,
      side,
      qty,
      price: fillPrice,
      ts: new Date().toISOString(),
    };
    await insertTrade(trade);

    const totalValue = Number((user.cashBalance + (await positionsMarketValue(userId))).toFixed(2));
    const equityUser = { ...user, equityHistory: await readEquity(userId) };
    recordEquitySnapshot(equityUser, totalValue);
    await writeEquity(userId, equityUser.equityHistory);

    return {
      trade,
      player: playerPublic(player),
      cashBalance: user.cashBalance,
      holding,
    };
  });
}

export async function payDividends(playerId, payoutPerShare) {
  if (!(payoutPerShare > 0)) throw httpError("payoutPerShare must be positive", 400);

  return withTx(async () => {
    const player = await getPricedPlayer(playerId, { forUpdate: true });
    if (!player) throw httpError("Player not found", 404);

    const holdings = await listHoldingsForPlayer(playerId);
    const userIds = [...new Set(holdings.map((holding) => holding.userId))].sort();
    const users = new Map();
    for (const id of userIds) {
      const user = await getUserById(id, { forUpdate: true });
      if (user) users.set(id, user);
    }

    const payments = [];
    for (const holding of holdings) {
      const user = users.get(holding.userId);
      if (!user) continue;
      const amount = Number((holding.shares * payoutPerShare).toFixed(2));
      const cash = Number((user.cashBalance + amount).toFixed(2));
      user.cashBalance = cash;
      await updateUserCash(user.id, cash);
      payments.push({ userId: holding.userId, shares: holding.shares, amount });
    }

    const performanceScore = Number((player.performanceScore + payoutPerShare).toFixed(2));
    await writePlayerMarket(playerId, { performanceScore });
    player.performanceScore = performanceScore;

    return {
      playerId,
      payoutPerShare,
      payments,
      totalPaid: Number(payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)),
      player: playerPublic(player),
    };
  });
}
