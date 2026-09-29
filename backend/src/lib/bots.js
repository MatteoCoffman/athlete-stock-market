import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { BOT_CASH, BOT_COUNT, BOT_INTERVAL_MS, BOTS_ENABLED } from "./config.js";
import {
  getHolding,
  getPricedPlayer,
  getUserByEmail,
  getUserById,
  insertUser,
  listPositiveHoldingsForUsers,
  listPricedPlayers,
  markUserBot,
  resetOpenPrices,
  updateUserCash,
  upsertHolding,
  withTx,
  writePlayerMarket,
} from "./market.js";
import { backfillLongHistories } from "./marketPlayers.js";
import { executeTrade, freeFloat } from "./trading.js";

const BOT_PASSWORD_HASH = bcrypt.hashSync("bot-market-pass", 8);

/** Rolling market-wide side counts — aim for ~50/50 overall, not per bot. */
const sideStats = { buy: 0, sell: 0 };

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickWeighted(items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return items[randInt(0, items.length - 1)];
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Create / top-up bot accounts. Marked with isBot so demos stay obvious.
 * History backfill stays on startup; a tick only touches accounts and cash.
 */
export function ensureBots() {
  return withTx(() => {
    const players = listPricedPlayers();
    if (players.length === 0) return [];

    const bots = [];
    for (let i = 1; i <= BOT_COUNT; i += 1) {
      const email = `bot${i}@jock.exchange`;
      let bot = getUserByEmail(email);
      if (!bot) {
        const id = uuidv4();
        const createdAt = new Date().toISOString();
        insertUser({
          id,
          email,
          passwordHash: BOT_PASSWORD_HASH,
          cashBalance: BOT_CASH,
          createdAt,
          isBot: true,
          equityHistory: [{ t: createdAt, value: BOT_CASH }],
        });

        let cash = BOT_CASH;
        const starters = [...players].sort(() => Math.random() - 0.5).slice(0, 6);
        for (const starter of starters) {
          const qty = randInt(20, 80);
          const fresh = getPricedPlayer(starter.id);
          if (!fresh || freeFloat(fresh) < qty) continue;
          const cost = Number((qty * fresh.price).toFixed(2));
          upsertHolding({ userId: id, playerId: fresh.id, shares: qty, avgCost: fresh.price });
          writePlayerMarket(fresh.id, { sharesHeld: fresh.sharesHeld + qty });
          cash = Number((cash - cost).toFixed(2));
          starter.sharesHeld += qty;
        }
        updateUserCash(id, cash);
        bot = getUserById(id);
      } else {
        if (!bot.isBot) markUserBot(bot.id);
        if (bot.cashBalance < BOT_CASH * 0.15) {
          updateUserCash(bot.id, Number((bot.cashBalance + BOT_CASH * 0.5).toFixed(2)));
          bot = getUserById(bot.id);
        }
      }
      bots.push(bot);
    }
    return bots;
  });
}

function chooseQty(player, side, maxAffordableShares, heldShares) {
  const base = Math.max(3, Math.round(2400 / Math.max(player.price, 40)));
  const roll = Math.random();
  let mult = 1;
  if (roll < 0.05) mult = randInt(5, 8);
  else if (roll < 0.18) mult = randInt(3, 4);
  else if (roll < 0.35) mult = 2;

  const hi = Math.round(base * mult) + randInt(0, 12);
  const lo = Math.max(2, Math.floor(hi * 0.55));
  let qty = randInt(lo, hi);

  if (side === "buy") {
    qty = Math.min(qty, maxAffordableShares, freeFloat(player));
  } else if (mult >= 3 && heldShares > 0) {
    const dump = Math.max(qty, Math.floor(heldShares * (0.35 + Math.random() * 0.45)));
    qty = Math.min(dump, heldShares);
  } else {
    qty = Math.min(qty, heldShares);
  }
  return Math.max(0, Math.trunc(qty));
}

function desiredSide() {
  const total = sideStats.buy + sideStats.sell;
  if (total < 4) return Math.random() < 0.5 ? "buy" : "sell";
  const buyShare = sideStats.buy / total;
  if (buyShare > 0.52) return "sell";
  if (buyShare < 0.48) return "buy";
  return Math.random() < 0.5 ? "buy" : "sell";
}

export function runBotTick() {
  const bots = ensureBots();
  const players = listPricedPlayers();
  if (!bots.length || !players.length) return null;

  const side = desiredSide();
  let bot;
  let player;
  let held = 0;

  if (side === "sell") {
    const lots = listPositiveHoldingsForUsers(bots.map((entry) => entry.id)).filter((lot) =>
      players.some((candidate) => candidate.id === lot.playerId)
    );
    if (lots.length === 0) return null;
    const byId = new Map(players.map((candidate) => [candidate.id, candidate]));
    const lot = pickWeighted(lots, (entry) => Math.pow(Math.max(byId.get(entry.playerId).price, 1), 1.2));
    bot = bots.find((entry) => entry.id === lot.userId) || getUserById(lot.userId);
    player = byId.get(lot.playerId);
    held = lot.shares;
  } else {
    bot = bots[randInt(0, bots.length - 1)];
    player = pickWeighted(players, (candidate) => Math.pow(Math.max(candidate.price, 1), 1.4));
    held = getHolding(bot.id, player.id).shares || 0;
    if (freeFloat(player) <= 0) return null;
  }

  const maxBuy = Math.floor(bot.cashBalance / Math.max(player.price, 1));
  const qty = chooseQty(player, side, maxBuy, held);
  if (qty <= 0) return null;

  try {
    const result = executeTrade({
      userId: bot.id,
      playerId: player.id,
      side,
      qty,
    });
    sideStats[side] += 1;
    if (sideStats.buy + sideStats.sell > 80) {
      sideStats.buy = Math.floor(sideStats.buy * 0.7);
      sideStats.sell = Math.floor(sideStats.sell * 0.7);
    }
    return {
      bot: bot.email,
      side,
      qty,
      playerId: player.id,
      price: result.trade.price,
      newPrice: result.player.price,
      balance: `${sideStats.buy}B/${sideStats.sell}S`,
    };
  } catch {
    return null;
  }
}

let timer = null;

export function startBotMarket() {
  if (!BOTS_ENABLED) {
    console.log("Bot market disabled (BOTS_ENABLED=0)");
    return;
  }
  if (timer) return;

  sideStats.buy = 0;
  sideStats.sell = 0;

  withTx(() => {
    ensureBots();
    resetOpenPrices();
  });
  backfillLongHistories();

  console.log(
    `Bot market on · ${BOT_COUNT} bots · ~50/50 buy/sell · every ${BOT_INTERVAL_MS}ms (BOTS_ENABLED=0 to stop)`
  );

  timer = setInterval(() => {
    try {
      const result = runBotTick();
      if (result) {
        console.log(
          `[bot] ${result.bot} ${result.side} ${result.qty} ${result.playerId} @ ${result.price} → ${result.newPrice} (${result.balance})`
        );
      }
    } catch (err) {
      console.error("[bot] tick failed", err.message);
    }
  }, BOT_INTERVAL_MS);

  if (typeof timer.unref === "function") timer.unref();
}

export function stopBotMarket() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
