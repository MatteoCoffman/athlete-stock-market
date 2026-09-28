import { openDb } from "../db/index.js";
import {
  fetchWeekStats,
  getNflState,
  pickStatFields,
  statChipsForPosition,
  sumStats,
} from "./sleeper.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RECENT_GAMES = 5;

function isFresh(fetchedAt) {
  if (!fetchedAt) return false;
  const ts = Date.parse(fetchedAt.includes("T") ? fetchedAt : `${fetchedAt}Z`);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < CACHE_TTL_MS;
}

/**
 * Cached Sleeper week stats + season aggregation for player profiles.
 */
export class PlayerStatsService {
  /** @param {import('node:sqlite').DatabaseSync} [db] */
  constructor(db = openDb()) {
    this.db = db;
  }

  getCachedWeek(sleeperId, season, week) {
    const row = this.db
      .prepare(
        `SELECT payload_json, fetched_at FROM player_week_stats
         WHERE sleeper_id = ? AND season = ? AND week = ?`
      )
      .get(String(sleeperId), Number(season), Number(week));
    if (!row) return null;
    return {
      stats: pickStatFields(JSON.parse(row.payload_json)),
      fetchedAt: row.fetched_at,
      fresh: isFresh(row.fetched_at),
    };
  }

  saveWeek(sleeperId, season, week, rawPayload) {
    this.db
      .prepare(
        `INSERT INTO player_week_stats (sleeper_id, season, week, payload_json, fetched_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(sleeper_id, season, week) DO UPDATE SET
           payload_json = excluded.payload_json,
           fetched_at = datetime('now')`
      )
      .run(String(sleeperId), Number(season), Number(week), JSON.stringify(rawPayload || {}));
  }

  /**
   * Ensure weeks 1..currentWeek are cached for this sleeper id (batch-fetch missing/stale weeks).
   */
  async ensureWeeksCached(sleeperId, season, currentWeek, seasonType = "regular") {
    const sid = String(sleeperId);
    const weeksNeeded = [];
    for (let w = 1; w <= currentWeek; w++) {
      const cached = this.getCachedWeek(sid, season, w);
      if (!cached || !cached.fresh) weeksNeeded.push(w);
    }

    await Promise.all(
      weeksNeeded.map(async (week) => {
        try {
          const all = await fetchWeekStats(season, week, seasonType);
          const raw = all[sid] || {};
          this.saveWeek(sid, season, week, raw);
        } catch (err) {
          const cached = this.getCachedWeek(sid, season, week);
          if (!cached) this.saveWeek(sid, season, week, {});
          console.warn(`Sleeper week ${week} fetch failed:`, err.message);
        }
      })
    );
  }

  listWeekStats(sleeperId, season, maxWeek) {
    const rows = this.db
      .prepare(
        `SELECT week, payload_json FROM player_week_stats
         WHERE sleeper_id = ? AND season = ? AND week <= ?
         ORDER BY week ASC`
      )
      .all(String(sleeperId), Number(season), Number(maxWeek));

    return rows.map((r) => ({
      week: r.week,
      stats: pickStatFields(JSON.parse(r.payload_json)),
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
      // During preseason, still try regular season once week rolls; clamp reasonable
      if (seasonType === "pre" || seasonType === "post") {
        seasonType = "regular";
      }
    } catch {
      season = new Date().getFullYear();
      week = 1;
    }

    await this.ensureWeeksCached(player.sleeperId, season, week, seasonType);
    const weeks = this.listWeekStats(player.sleeperId, season, week);
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
