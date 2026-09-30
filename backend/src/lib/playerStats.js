import { iso, query, queryOne, queryRows } from "../db/pg/client.js";
import {
  fetchWeekStats,
  getNflState,
  pickStatFields,
  statChipsForPosition,
  sumStats,
} from "./sleeper.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RECENT_GAMES = 5;

function payloadOf(value) {
  if (value == null) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function isFresh(fetchedAt) {
  if (!fetchedAt) return false;
  const ts = Date.parse(fetchedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < CACHE_TTL_MS;
}

/**
 * Cached Sleeper week stats + season aggregation for player profiles.
 */
export class PlayerStatsService {
  async getCachedWeek(sleeperId, season, week) {
    const row = await queryOne(
      `SELECT payload_json, fetched_at FROM player_week_stats
       WHERE sleeper_id = $1 AND season = $2 AND week = $3`,
      [String(sleeperId), Number(season), Number(week)]
    );
    if (!row) return null;
    const fetchedAt = iso(row.fetched_at);
    return {
      stats: pickStatFields(payloadOf(row.payload_json)),
      fetchedAt,
      fresh: isFresh(fetchedAt),
    };
  }

  async saveWeek(sleeperId, season, week, rawPayload) {
    await query(
      `INSERT INTO player_week_stats (sleeper_id, season, week, payload_json, fetched_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (sleeper_id, season, week) DO UPDATE SET
         payload_json = EXCLUDED.payload_json,
         fetched_at = now()`,
      [String(sleeperId), Number(season), Number(week), JSON.stringify(rawPayload || {})]
    );
  }

  /**
   * Ensure weeks 1..currentWeek are cached for this sleeper id (batch-fetch missing/stale weeks).
   */
  async ensureWeeksCached(sleeperId, season, currentWeek, seasonType = "regular") {
    const sid = String(sleeperId);
    const weeksNeeded = [];
    for (let w = 1; w <= currentWeek; w++) {
      const cached = await this.getCachedWeek(sid, season, w);
      if (!cached || !cached.fresh) weeksNeeded.push(w);
    }

    await Promise.all(
      weeksNeeded.map(async (week) => {
        try {
          const all = await fetchWeekStats(season, week, seasonType);
          const raw = all[sid] || {};
          await this.saveWeek(sid, season, week, raw);
        } catch (err) {
          const cached = await this.getCachedWeek(sid, season, week);
          if (!cached) await this.saveWeek(sid, season, week, {});
          console.warn(`Sleeper week ${week} fetch failed:`, err.message);
        }
      })
    );
  }

  async listWeekStats(sleeperId, season, maxWeek) {
    const rows = await queryRows(
      `SELECT week, payload_json FROM player_week_stats
       WHERE sleeper_id = $1 AND season = $2 AND week <= $3
       ORDER BY week ASC`,
      [String(sleeperId), Number(season), Number(maxWeek)]
    );

    return rows.map((r) => ({
      week: r.week,
      stats: pickStatFields(payloadOf(r.payload_json)),
    }));
  }

  /**
   * @param {{ keyId: string, name: string, teamAbbr: string, positionAbbr: string, sleeperId?: string|null, headshotUrl?: string|null }} player
   */
  async buildProfile(player) {
    if (!player.sleeperId) {
      return {
        player: {
          id: player.keyId,
          name: player.name,
          team: player.teamAbbr,
          position: player.positionAbbr,
          headshotUrl: player.headshotUrl,
          sleeperId: null,
        },
        season: null,
        week: null,
        seasonStats: {},
        seasonChips: statChipsForPosition(player.positionAbbr, {}),
        recentGames: [],
        statsAvailable: false,
      };
    }

    let season;
    let week;
    let seasonType = "regular";
    try {
      const state = await getNflState();
      season = Number(state.season) || new Date().getFullYear();
      week = Math.max(1, Number(state.week) || 1);
      if (state.season_type) seasonType = state.season_type;
      if (seasonType === "pre" || seasonType === "post") {
        seasonType = "regular";
      }
    } catch {
      season = new Date().getFullYear();
      week = 1;
    }

    await this.ensureWeeksCached(player.sleeperId, season, week, seasonType);
    const weeks = await this.listWeekStats(player.sleeperId, season, week);
    const played = weeks.filter((w) => Object.keys(w.stats).length > 0);
    const seasonStats = sumStats(played.map((w) => w.stats));
    const recentGames = [...played]
      .reverse()
      .slice(0, RECENT_GAMES)
      .map((w) => ({
        week: w.week,
        season,
        stats: w.stats,
        chips: statChipsForPosition(player.positionAbbr, w.stats),
      }));

    return {
      player: {
        id: player.keyId,
        name: player.name,
        team: player.teamAbbr,
        position: player.positionAbbr,
        headshotUrl: player.headshotUrl,
        sleeperId: player.sleeperId,
      },
      season,
      week,
      seasonStats,
      seasonChips: statChipsForPosition(player.positionAbbr, seasonStats),
      recentGames,
      statsAvailable: played.length > 0,
    };
  }
}

export const playerStatsService = new PlayerStatsService();
