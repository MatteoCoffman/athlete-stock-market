import fs from "fs";
import path from "path";
import { getDbPath } from "../db/index.js";
import {
  capTrades,
  countPricedPlayers,
  countUsers,
  insertBarePlayer,
  insertTrade,
  insertUser,
  upsertHolding,
  withTx,
  writePlayerMarket,
  writePriceHistory,
} from "./market.js";

const HISTORY_CAP = 800;
const EQUITY_CAP = 2500;
const TRADE_CAP = 500;

export function storeJsonPath() {
  return path.join(path.dirname(getDbPath()), "store.json");
}

function importedPath(storePath) {
  const dest = `${storePath}.imported`;
  if (!fs.existsSync(dest)) return dest;
  return `${storePath}.imported.${Date.now()}`;
}

/**
 * Copy store.json into jock.db once, when the market is still empty.
 * User ids and player ids are preserved so existing JWTs keep working.
 * @returns {{ imported: boolean, reason?: string, users?: number, players?: number, renamedTo?: string }}
 */
export function importStoreIfPresent() {
  const storePath = storeJsonPath();
  if (!fs.existsSync(storePath)) return { imported: false, reason: "no store.json" };
  if (countUsers() > 0) return { imported: false, reason: "users already exist" };
  if (countPricedPlayers() > 0) return { imported: false, reason: "market already priced" };

  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  const users = store.users && typeof store.users === "object" ? Object.values(store.users) : [];
  const players =
    store.players && typeof store.players === "object" ? Object.values(store.players) : [];
  const holdings =
    store.holdings && typeof store.holdings === "object" ? Object.values(store.holdings) : [];
  const trades = Array.isArray(store.trades) ? store.trades.slice(0, TRADE_CAP) : [];

  const userIds = new Set();
  const playerIds = new Set();

  withTx(() => {
    for (const player of players) {
      if (!player?.id) continue;
      insertBarePlayer(player);
      writePlayerMarket(player.id, {
        price: player.price,
        openPrice: player.openPrice ?? player.price,
        sharesOutstanding: player.sharesOutstanding ?? 10000,
        sharesHeld: player.sharesHeld ?? 0,
        performanceScore: player.performanceScore ?? 0,
      });
      const history = Array.isArray(player.priceHistory) ? player.priceHistory.slice(-HISTORY_CAP) : [];
      if (history.length) writePriceHistory(player.id, history);
      playerIds.add(player.id);
    }

    for (const user of users) {
      if (!user?.id || !user.email || !user.passwordHash) continue;
      const equity = Array.isArray(user.equityHistory) ? user.equityHistory.slice(-EQUITY_CAP) : [];
      insertUser({
        id: user.id,
        email: String(user.email).trim().toLowerCase(),
        passwordHash: user.passwordHash,
        cashBalance: user.cashBalance ?? 0,
        createdAt: user.createdAt || new Date().toISOString(),
        isBot: Boolean(user.isBot),
        equityHistory: equity,
      });
      userIds.add(user.id);
    }

    for (const holding of holdings) {
      const userId = holding.userId;
      const playerId = holding.playerId;
      if (!userIds.has(userId) || !playerIds.has(playerId)) continue;
      upsertHolding({
        userId,
        playerId,
        shares: holding.shares ?? 0,
        avgCost: holding.avgCost ?? 0,
      });
    }

    for (let i = trades.length - 1; i >= 0; i -= 1) {
      const trade = trades[i];
      if (!trade?.id || !userIds.has(trade.userId) || !playerIds.has(trade.playerId)) continue;
      insertTrade(
        {
          id: trade.id,
          userId: trade.userId,
          playerId: trade.playerId,
          side: trade.side,
          qty: trade.qty,
          price: trade.price,
          ts: trade.ts,
        },
        { cap: false }
      );
    }
    capTrades();
  });

  const dest = importedPath(storePath);
  fs.renameSync(storePath, dest);
  return { imported: true, users: userIds.size, players: playerIds.size, renamedTo: dest };
}
