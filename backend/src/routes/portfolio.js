import { Router } from "express";
import { authMiddleware, publicUser } from "../lib/auth.js";
import { loadStore } from "../lib/store.js";
import { playerPublic } from "../lib/trading.js";

const router = Router();

router.get("/", authMiddleware, (req, res) => {
  const store = loadStore();
  const user = store.users[req.userId];
  if (!user) return res.status(404).json({ error: "User not found" });

  const positions = Object.values(store.holdings)
    .filter((h) => h.userId === req.userId && h.shares > 0)
    .map((h) => {
      const player = store.players[h.playerId];
      const marketValue = player ? Number((player.price * h.shares).toFixed(2)) : 0;
      return {
        playerId: h.playerId,
        shares: h.shares,
        avgCost: h.avgCost,
        marketValue,
        player: player ? playerPublic(player) : null,
      };
    })
    .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));

  const positionsValue = positions.reduce((s, p) => s + p.marketValue, 0);
  res.json({
    user: publicUser(user),
    cashBalance: user.cashBalance,
    positionsValue: Number(positionsValue.toFixed(2)),
    totalValue: Number((user.cashBalance + positionsValue).toFixed(2)),
    positions,
  });
});

export default router;
