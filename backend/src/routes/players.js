import { Router } from "express";
import { loadStore } from "../lib/store.js";
import { playerPublic } from "../lib/trading.js";

const router = Router();

router.get("/", (_req, res) => {
  const store = loadStore();
  const players = Object.values(store.players)
    .map(playerPublic)
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ players });
});

router.get("/:id", (req, res) => {
  const store = loadStore();
  const player = store.players[req.params.id];
  if (!player) return res.status(404).json({ error: "Player not found" });
  const recentTrades = store.trades
    .filter((t) => t.playerId === player.id)
    .slice(0, 30)
    .map((t) => ({ id: t.id, side: t.side, qty: t.qty, price: t.price, ts: t.ts }));
  res.json({ player: playerPublic(player), recentTrades });
});

export default router;
