import { Router } from "express";
import { searchPlayerNews } from "../lib/currents.js";
import {
  getPlayerIdentity,
  getPricedPlayer,
  listPricedPlayerIds,
  listPricedPlayersByIds,
  recentTrades,
} from "../lib/market.js";
import { ensureMarketPlayers, mergeRosterWithMarket } from "../lib/marketPlayers.js";
import { playerLibrary } from "../lib/playerLibrary.js";
import { playerStatsService } from "../lib/playerStats.js";
import { playerPublic } from "../lib/trading.js";

const router = Router();

async function resolveRosterPlayer(id) {
  return (await playerLibrary.getByKeyId(id)) || (await getPlayerIdentity(id));
}

async function publicTrades(playerId) {
  return (await recentTrades(playerId, 30)).map((trade) => ({
    id: trade.id,
    side: trade.side,
    qty: trade.qty,
    price: trade.price,
    ts: trade.ts,
  }));
}

router.get("/", async (req, res) => {
  try {
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

    const rosterCount = await playerLibrary.count({ activeOnly: true });

    if (rosterCount === 0) {
      const priced = await listPricedPlayersByIds(await listPricedPlayerIds());
      const players = priced.map(playerPublic).sort((a, b) => a.name.localeCompare(b.name));
      return res.json({ players, total: players.length, limit: players.length, offset: 0 });
    }

    const filter = { q, team, position, activeOnly: true, limit, offset };
    const roster = await playerLibrary.search(filter);
    const total = await playerLibrary.count({ q, team, position, activeOnly: true });
    await ensureMarketPlayers(roster);

    const marketById = new Map(
      (await listPricedPlayersByIds(roster.map((player) => player.keyId))).map((player) => [
        player.id,
        player,
      ])
    );
    const players = roster
      .map((player) => {
        const merged = mergeRosterWithMarket(player, marketById.get(player.keyId));
        return merged ? playerPublic(merged) : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ players, total, limit: players.length, offset: Number(offset) || 0 });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/:id/profile", async (req, res) => {
  try {
    const roster = await resolveRosterPlayer(req.params.id);
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
    const roster = await resolveRosterPlayer(req.params.id);
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

router.get("/:id", async (req, res) => {
  try {
    const roster = await playerLibrary.getByKeyId(req.params.id);
    if (roster) {
      await ensureMarketPlayers([roster]);
      const market = await getPricedPlayer(roster.keyId);
      const merged = mergeRosterWithMarket(roster, market);
      if (!merged) return res.status(404).json({ error: "Player not found" });
      return res.json({
        player: playerPublic(merged),
        recentTrades: await publicTrades(roster.keyId),
      });
    }

    const player = await getPricedPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json({ player: playerPublic(player), recentTrades: await publicTrades(player.id) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
