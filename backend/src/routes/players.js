import { Router } from "express";
import { openDb } from "../db/index.js";
import { ensureMarketPlayer, mergeRosterWithMarket } from "../lib/marketPlayers.js";
import { playerLibrary } from "../lib/playerLibrary.js";
import { playerStatsService } from "../lib/playerStats.js";
import { loadStore, saveStore } from "../lib/store.js";
import { playerPublic } from "../lib/trading.js";

const router = Router();

openDb();

router.get("/", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const team = typeof req.query.team === "string" ? req.query.team : "";
  const rawPos = req.query.position ?? req.query.positions;
  const position = Array.isArray(rawPos)
    ? rawPos.filter((p) => typeof p === "string").join(",")
    : typeof rawPos === "string"
      ? rawPos
      : "";
  const limit = req.query.limit;
  const offset = req.query.offset;

  const rosterCount = playerLibrary.count({ activeOnly: true });
  const store = loadStore();

  // Fallback: if SQL empty, serve JSON market store (legacy)
  if (rosterCount === 0) {
    const players = Object.values(store.players)
      .map(playerPublic)
      .sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ players, total: players.length, limit: players.length, offset: 0 });
  }

  const filter = { q, team, position, activeOnly: true, limit, offset };
  const roster = playerLibrary.search(filter);
  const total = playerLibrary.count({ q, team, position, activeOnly: true });

  let dirty = false;
  for (const r of roster) {
    if (ensureMarketPlayer(store, r)) dirty = true;
  }
  if (dirty) saveStore(store);

  const players = roster
    .map((r) => playerPublic(mergeRosterWithMarket(r, store.players[r.keyId])))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ players, total, limit: players.length, offset: Number(offset) || 0 });
});

router.get("/:id/profile", async (req, res) => {
  try {
    let roster = playerLibrary.getByKeyId(req.params.id);
    if (!roster) {
      const store = loadStore();
      const market = store.players[req.params.id];
      if (!market) return res.status(404).json({ error: "Player not found" });
      roster = {
        keyId: market.id,
        name: market.name,
        team: market.team,
        teamAbbr: market.team,
        positionAbbr: market.position,
        sleeperId: market.sleeperId || null,
        headshotUrl: market.headshotUrl || null,
      };
    }

    const profile = await playerStatsService.buildProfile(roster);
    res.json(profile);
  } catch (err) {
    console.error("profile error", err);
    res.status(502).json({ error: err.message || "Failed to load profile stats" });
  }
});

router.get("/:id", (req, res) => {
  const store = loadStore();
  const roster = playerLibrary.getByKeyId(req.params.id);

  if (roster) {
    if (ensureMarketPlayer(store, roster)) saveStore(store);
    const merged = mergeRosterWithMarket(roster, store.players[roster.keyId]);
    const recentTrades = store.trades
      .filter((t) => t.playerId === roster.keyId)
      .slice(0, 30)
      .map((t) => ({ id: t.id, side: t.side, qty: t.qty, price: t.price, ts: t.ts }));
    return res.json({ player: playerPublic(merged), recentTrades });
  }

  const player = store.players[req.params.id];
  if (!player) return res.status(404).json({ error: "Player not found" });
  const recentTrades = store.trades
    .filter((t) => t.playerId === player.id)
    .slice(0, 30)
    .map((t) => ({ id: t.id, side: t.side, qty: t.qty, price: t.price, ts: t.ts }));
  res.json({ player: playerPublic(player), recentTrades });
});

export default router;
