import { openDb } from "../db/index.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function mapRow(row) {
  if (!row) return null;
  return {
    keyId: row.key_id,
    name: row.name,
    team: row.team,
    teamAbbr: row.team_abbr,
    positionAbbr: row.position_abbr,
    gsisId: row.gsis_id || null,
    sleeperId: row.sleeper_id || null,
    espnId: row.espn_id || null,
    headshotUrl: row.headshot_url || null,
    openingPrice: row.opening_price == null ? null : Number(row.opening_price),
    active: Boolean(row.active),
  };
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function clampOffset(offset) {
  const n = Number(offset);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * SQL-backed roster lookup.
 */
export class PlayerLibrary {
  /** @param {import('node:sqlite').DatabaseSync} [db] */
  constructor(db = openDb()) {
    this.db = db;
  }

  getByKeyId(keyId) {
    const row = this.db
      .prepare(
        `SELECT key_id, name, team, team_abbr, position_abbr,
                gsis_id, sleeper_id, espn_id, headshot_url, opening_price, active
         FROM players WHERE key_id = ? LIMIT 1`
      )
      .get(String(keyId));
    return mapRow(row);
  }

  search(opts = {}) {
    const { where, params } = this._buildFilter(opts);
    const limit = clampLimit(opts.limit);
    const offset = clampOffset(opts.offset);
    const rows = this.db
      .prepare(
        `SELECT key_id, name, team, team_abbr, position_abbr,
                gsis_id, sleeper_id, espn_id, headshot_url, opening_price, active
         FROM players ${where}
         ORDER BY name COLLATE NOCASE
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);
    return rows.map(mapRow);
  }

  count(opts = {}) {
    const { where, params } = this._buildFilter(opts);
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM players ${where}`).get(...params);
    return row?.n ?? 0;
  }

  byTeam(teamOrAbbr, opts = {}) {
    return this.search({ ...opts, team: teamOrAbbr });
  }

  byPosition(positionAbbr, opts = {}) {
    return this.search({ ...opts, position: positionAbbr });
  }

  /** All active roster rows (paginated internally — not for public list APIs). */
  allActive() {
    const out = [];
    const pageSize = 500;
    let offset = 0;
    for (;;) {
      const batch = this.search({ activeOnly: true, limit: pageSize, offset });
      out.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  /**
   * @param {{
   *   keyId: string, name: string, team: string, teamAbbr: string, positionAbbr: string,
   *   gsisId?: string|null, sleeperId?: string|null, espnId?: string|null,
   *   headshotUrl?: string|null, openingPrice?: number|null, active?: boolean
   * }} player
   */
  upsert(player) {
    const keyId = String(player.keyId).trim();
    const name = String(player.name).trim();
    const team = String(player.team).trim();
    const teamAbbr = String(player.teamAbbr).trim().toUpperCase();
    const positionAbbr = String(player.positionAbbr).trim().toUpperCase();
    const active = player.active === false ? 0 : 1;
    const gsisId = player.gsisId ? String(player.gsisId).trim() : null;
    const sleeperId = player.sleeperId ? String(player.sleeperId).trim() : null;
    const espnId = player.espnId ? String(player.espnId).trim() : null;
    const headshotUrl = player.headshotUrl ? String(player.headshotUrl).trim() : null;
    const openingPrice =
      player.openingPrice == null || Number.isNaN(Number(player.openingPrice))
        ? null
        : Number(player.openingPrice);

    if (!keyId || !name || !team || !teamAbbr || !positionAbbr) {
      throw new Error("upsert requires keyId, name, team, teamAbbr, positionAbbr");
    }

    this.db
      .prepare(
        `INSERT INTO players (
           key_id, name, team, team_abbr, position_abbr,
           gsis_id, sleeper_id, espn_id, headshot_url, opening_price, active, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(key_id) DO UPDATE SET
           name = excluded.name,
           team = excluded.team,
           team_abbr = excluded.team_abbr,
           position_abbr = excluded.position_abbr,
           gsis_id = excluded.gsis_id,
           sleeper_id = excluded.sleeper_id,
           espn_id = excluded.espn_id,
           headshot_url = excluded.headshot_url,
           opening_price = excluded.opening_price,
           active = excluded.active,
           updated_at = datetime('now')`
      )
      .run(
        keyId,
        name,
        team,
        teamAbbr,
        positionAbbr,
        gsisId,
        sleeperId,
        espnId,
        headshotUrl,
        openingPrice,
        active
      );

    return this.getByKeyId(keyId);
  }

  _buildFilter(opts = {}) {
    const clauses = [];
    const params = [];

    if (opts.activeOnly !== false) {
      clauses.push("active = 1");
    }

    const q = String(opts.q ?? "").trim();
    if (q) {
      const like = `%${q}%`;
      clauses.push(
        `(name LIKE ? COLLATE NOCASE
          OR team LIKE ? COLLATE NOCASE
          OR team_abbr LIKE ? COLLATE NOCASE
          OR position_abbr LIKE ? COLLATE NOCASE
          OR key_id LIKE ? COLLATE NOCASE)`
      );
      params.push(like, like, like, like, like);
    }

    const team = String(opts.team ?? "").trim();
    if (team) {
      clauses.push("(team_abbr = ? COLLATE NOCASE OR team = ? COLLATE NOCASE)");
      params.push(team, team);
    }

    const position = opts.position ?? opts.positions;
    if (position != null && position !== "") {
      const list = (Array.isArray(position) ? position : String(position).split(","))
        .map((p) => String(p).trim().toUpperCase())
        .filter(Boolean);
      if (list.length === 1) {
        clauses.push("position_abbr = ? COLLATE NOCASE");
        params.push(list[0]);
      } else if (list.length > 1) {
        clauses.push(`(${list.map(() => "position_abbr = ? COLLATE NOCASE").join(" OR ")})`);
        params.push(...list);
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return { where, params };
  }
}

export const playerLibrary = new PlayerLibrary();
