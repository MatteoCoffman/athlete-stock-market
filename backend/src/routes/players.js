import { Router } from "express";
import { openDb } from "../db/index.js";
import { searchPlayerNews } from "../lib/currents.js";
import { getPlayerIdentity, getPricedPlayer, listPricedPlayersByIds, recentTrades } from "../lib/market.js";
import { ensureMarketPlayers, mergeRosterWithMarket } from "../lib/marketPlayers.js";
import { playerLibrary } from "../lib/playerLibrary.js";
import { playerStatsService } from "../lib/playerStats.js";
import { playerPublic } from "../lib/trading.js";

const router = Router();

openDb();

function resolveRosterPlayer(id) {
  return playerLibrary.getByKeyId(id) || getPlayerIdentity(id);
}

function publicTrades(playerId) {
  return recentTrades(playerId, 30).map((trade) => ({
    id: trade.id,
    side: trade.side,
    qty: trade.qty,
    price: trade.price,
    ts: trade.ts,
  }));
}

router.get("/", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const team = typeof req.query.team === "string" ? req.query.team : "";
  const rawPos = req.query.position ?? req.query.positions;
  const position = Array.isArray(rawPos)
    ? rawPos.filter((entry) => typeof entry === "string").join(",")
    : typeof rawPos === "string"
      ? rawPos
      : "";
  const limit = req.query.limit;
  const offset = req.query.offset;

  const rosterCount = playerLibrary.count({ activeOnly: true });

  if (rosterCount === 0) {
    const ids = listPricedPlayersByIds(
      openDb()
        .prepare("SELECT key_id FROM players WHERE price IS NOT NULL")
        .all()
        .map((row) => row.key_id)
    );
    const players = ids
      .map(playerPublic)
      .sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ players, total: players.length, limit: players.length, offset: 0 });
  }

  const filter = { q, team, position, activeOnly: true, limit, offset };
  const roster = playerLibrary.search(filter);
  const total = playerLibrary.count({ q, team, position, activeOnly: true });
  ensureMarketPlayers(roster);

  const marketById = new Map(
    listPricedPlayersByIds(roster.map((player) => player.keyId)).map((player) => [player.id, player])
  );
  const players = roster
    .map((player) => {
      const merged = mergeRosterWithMarket(player, marketById.get(player.keyId));
      return merged ? playerPublic(merged) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ players, total, limit: players.length, offset: Number(offset) || 0 });
});

router.get("/:id/profile", async (req, res) => {
  try {
    const roster = resolveRosterPlayer(req.params.id);
    if (!roster) return res.status(404).json({ error: "Player not found" });

    const profile = await playerStatsService.buildProfile(roster);
    res.json(profile);
  } catch (err) {
    console.error("profile error", err);
    res.status(502).json({ error: err.message || "Failed to load profile stats" });
  }
});

router.get("/:id/news", async (req, res) => {
  try {
    const roster = resolveRosterPlayer(req.params.id);
    if (!roster) return res.status(404).json({ error: "Player not found" });

    const articles = await searchPlayerNews(
      {
        name: roster.name,
        team: roster.team,
        teamAbbr: roster.teamAbbr,
      },
      { pageSize: 20, limit: 4 }
    );
    res.json({
      playerId: roster.keyId,
      name: roster.name,
      articles,
    });
  } catch (err) {
    console.error("news error", err);
    const status = err.status && Number.isInteger(err.status) ? err.status : 502;
    res.status(status).json({ error: err.message || "Failed to load player news" });
  }
});

router.get("/:id", (req, res) => {
  const roster = playerLibrary.getByKeyId(req.params.id);
  if (roster) {
    ensureMarketPlayers([roster]);
    const market = getPricedPlayer(roster.keyId);
    const merged = mergeRosterWithMarket(roster, market);
    if (!merged) return res.status(404).json({ error: "Player not found" });
    return res.json({ player: playerPublic(merged), recentTrades: publicTrades(roster.keyId) });
  }

  const player = getPricedPlayer(req.params.id);
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json({ player: playerPublic(player), recentTrades: publicTrades(player.id) });
});

export default router;
