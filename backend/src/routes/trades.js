import { Router } from "express";
import { authMiddleware } from "../lib/auth.js";
import { executeTrade } from "../lib/trading.js";

const router = Router();

router.post("/", authMiddleware, (req, res) => {
  try {
    const { playerId, side, qty } = req.body;
    const result = executeTrade({
      userId: req.userId,
      playerId,
      side,
      qty: Math.trunc(Number(qty)),
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
