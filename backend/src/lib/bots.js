import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import {
  BOT_CASH,
  BOT_COUNT,
  BOT_INTERVAL_MS,
  BOTS_ENABLED,
} from "./config.js";
import { buildPriceHistory } from "./history.js";
import { withStore } from "./store.js";
import { executeTrade, freeFloat, holdingKey } from "./trading.js";

const BOT_PASSWORD_HASH = bcrypt.hashSync("bot-market-pass", 8);

/** Rolling market-wide side counts — aim for ~50/50 overall, not per bot. */
const sideStats = { buy: 0, sell: 0 };

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickWeighted(items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[randInt(0, items.length - 1)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function ensurePriceHistory(player) {
  if (!Array.isArray(player.priceHistory) || player.priceHistory.length < 2) {
    player.priceHistory = buildPriceHistory(player.price);
  }
}

/**
 * Create / top-up bot accounts. Marked with isBot so demos stay obvious in the store.
 */
export function ensureBots(store) {
  const players = Object.values(store.players);
  if (players.length === 0) return [];

  for (const player of players) ensurePriceHistory(player);

  const bots = [];
  for (let i = 1; i <= BOT_COUNT; i += 1) {
    const email = `bot${i}@jock.exchange`;
    let bot = Object.values(store.users).find((u) => u.email === email);
    if (!bot) {
      bot = {
        id: uuidv4(),
        email,
        passwordHash: BOT_PASSWORD_HASH,
        cashBalance: BOT_CASH,
        createdAt: new Date().toISOString(),
        isBot: true,
      };
      store.users[bot.id] = bot;

      // Spread starter lots so the market can sell any name early (bigger books for blocks).
      const starters = [...players].sort(() => Math.random() - 0.5).slice(0, 6);
      for (const player of starters) {
        const qty = randInt(20, 80);
        if (freeFloat(player) < qty) continue;
        const key = holdingKey(bot.id, player.id);
        store.holdings[key] = {
          userId: bot.id,
          playerId: player.id,
          shares: qty,
          avgCost: player.price,
        };
        player.sharesHeld += qty;
        bot.cashBalance = Number((bot.cashBalance - qty * player.price).toFixed(2));
      }
    } else {
      bot.isBot = true;
      if (bot.cashBalance < BOT_CASH * 0.15) {
        bot.cashBalance = Number((bot.cashBalance + BOT_CASH * 0.5).toFixed(2));
      }
    }
    bots.push(bot);
  }
  return bots;
}

function botHoldings(store, botId) {
  return Object.values(store.holdings).filter((h) => h.userId === botId && h.shares > 0);
}

function allSellableLots(store, bots) {
  const botIds = new Set(bots.map((b) => b.id));
  return Object.values(store.holdings).filter(
    (h) => botIds.has(h.userId) && h.shares > 0 && store.players[h.playerId]
  );
}

function chooseQty(player, side, maxAffordableShares, heldShares) {
  // Typical clip sized by price; occasionally punch through with a block trade.
  const base = Math.max(3, Math.round(2400 / Math.max(player.price, 40)));
  const roll = Math.random();
  let mult = 1;
  if (roll < 0.05) mult = randInt(5, 8); // ~5% whale block
  else if (roll < 0.18) mult = randInt(3, 4); // ~13% large
  else if (roll < 0.35) mult = 2; // ~17% elevated

  const hi = Math.round(base * mult) + randInt(0, 12);
  const lo = Math.max(2, Math.floor(hi * 0.55));
  let qty = randInt(lo, hi);

  if (side === "buy") {
    qty = Math.min(qty, maxAffordableShares, freeFloat(player));
  } else {
    // Large sells: dump a bigger slice of the lot when we rolled up.
    if (mult >= 3 && heldShares > 0) {
      const dump = Math.max(qty, Math.floor(heldShares * (0.35 + Math.random() * 0.45)));
      qty = Math.min(dump, heldShares);
    } else {
      qty = Math.min(qty, heldShares);
    }
  }
  return Math.max(0, Math.trunc(qty));
}

/** Target 50/50 overall; if one side leads by 2+, nudge the other way. */
function desiredSide() {
  const total = sideStats.buy + sideStats.sell;
  if (total < 4) return Math.random() < 0.5 ? "buy" : "sell";
  const buyShare = sideStats.buy / total;
  if (buyShare > 0.52) return "sell";
  if (buyShare < 0.48) return "buy";
  return Math.random() < 0.5 ? "buy" : "sell";
}

export function runBotTick() {
  return withStore((store) => {
    const bots = ensureBots(store);
    const players = Object.values(store.players);
    if (!bots.length || !players.length) return null;

    const side = desiredSide();
    let bot;
    let player;
    let held = 0;

    if (side === "sell") {
      const lots = allSellableLots(store, bots);
      if (lots.length === 0) {
        // Nobody can sell yet — flip to buy so the tick isn't wasted.
        return null;
      }
      // Prefer selling higher-priced / recently bid-up names a bit.
      const lot = pickWeighted(lots, (h) => Math.pow(Math.max(store.players[h.playerId].price, 1), 1.2));
      bot = store.users[lot.userId];
      player = store.players[lot.playerId];
      held = lot.shares;
    } else {
      bot = bots[randInt(0, bots.length - 1)];
      player = pickWeighted(players, (p) => Math.pow(Math.max(p.price, 1), 1.4));
      held = store.holdings[holdingKey(bot.id, player.id)]?.shares || 0;
      if (freeFloat(player) <= 0) return null;
    }

    const maxBuy = Math.floor(bot.cashBalance / Math.max(player.price, 1));
    const qty = chooseQty(player, side, maxBuy, held);
    if (qty <= 0) return null;

    try {
      const result = executeTrade(store, {
        userId: bot.id,
        playerId: player.id,
        side,
        qty,
      });
      sideStats[side] += 1;
      // Keep the window from growing forever — decay toward balance.
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
  });
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

  withStore((store) => {
    ensureBots(store);
    for (const player of Object.values(store.players)) {
      player.openPrice = player.price;
      ensurePriceHistory(player);
    }
  });

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
