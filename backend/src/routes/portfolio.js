import { Router } from "express";
import { authMiddleware, publicUser } from "../lib/auth.js";
import { dayChangePct, equityChartSeries, recordEquitySnapshot } from "../lib/equity.js";
import {
  getPricedPlayer,
  getUserById,
  listUserHoldings,
  positionsMarketValue,
  readEquity,
  withTx,
  writeEquity,
} from "../lib/market.js";
import { playerPublic } from "../lib/trading.js";

const router = Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const body = await withTx(async () => {
      const user = await getUserById(req.userId);
      if (!user) return null;

      const holdings = await listUserHoldings(req.userId);
      const positions = [];
      for (const holding of holdings) {
        const player = await getPricedPlayer(holding.playerId);
        const marketValue = player ? Number((player.price * holding.shares).toFixed(2)) : 0;
        positions.push({
          playerId: holding.playerId,
          shares: holding.shares,
          avgCost: holding.avgCost,
          marketValue,
          player: player ? playerPublic(player) : null,
        });
      }
      positions.sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));

      const positionsValue = Number((await positionsMarketValue(req.userId)).toFixed(2));
      const totalValue = Number((user.cashBalance + positionsValue).toFixed(2));
      const equityUser = { ...user, equityHistory: await readEquity(user.id) };
      recordEquitySnapshot(equityUser, totalValue);
      await writeEquity(user.id, equityUser.equityHistory);

      return {
        user: publicUser(user),
        cashBalance: user.cashBalance,
        positionsValue,
        totalValue,
        dayChangePct: dayChangePct(equityUser.equityHistory, totalValue),
        equityHistory: equityChartSeries(equityUser.equityHistory),
        positions,
      };
    });

    if (!body) return res.status(404).json({ error: "User not found" });
    res.json(body);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
