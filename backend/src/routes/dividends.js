import { Router } from "express";
import { ADMIN_TOKEN } from "../lib/config.js";
import { loadStore, withStore } from "../lib/store.js";
import { payDividends, playerPublic } from "../lib/trading.js";

const router = Router();

function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.body?.adminToken;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "Admin token required" });
  }
  return next();
}

router.post("/pay", adminAuth, (req, res) => {
  try {
    const { playerId, payoutPerShare } = req.body;
    const result = withStore((store) =>
      payDividends(store, playerId, Number(payoutPerShare))
    );
    const store = loadStore();
    const player = store.players[playerId];
    res.json({
      ...result,
      player: player ? playerPublic(player) : null,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/score", adminAuth, (req, res) => {
  try {
    const { playerId, performanceScore } = req.body;
    const player = withStore((store) => {
      const p = store.players[playerId];
      if (!p) {
        const err = new Error("Player not found");
        err.status = 404;
        throw err;
      }
      p.performanceScore = Number(performanceScore);
      return playerPublic(p);
    });
    res.json({ player });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
