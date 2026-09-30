import { Router } from "express";
import { ADMIN_TOKEN } from "../lib/config.js";
import { setPerformanceScore } from "../lib/market.js";
import { payDividends, playerPublic } from "../lib/trading.js";

const router = Router();

function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.body?.adminToken;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "Admin token required" });
  }
  return next();
}

router.post("/pay", adminAuth, async (req, res) => {
  try {
    const { playerId, payoutPerShare } = req.body;
    const result = await payDividends(playerId, Number(payoutPerShare));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/score", adminAuth, async (req, res) => {
  try {
    const { playerId, performanceScore } = req.body;
    const player = await setPerformanceScore(playerId, Number(performanceScore));
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json({ player: playerPublic(player) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
