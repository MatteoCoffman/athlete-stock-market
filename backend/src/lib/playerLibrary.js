import { query, queryOne, queryRows } from "../db/pg/client.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const ROSTER_COLUMNS = `
  key_id, name, team, team_abbr, position_abbr,
  gsis_id, sleeper_id, espn_id, headshot_url, opening_price, active
`;

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
  async getByKeyId(keyId) {
    const row = await queryOne(
      `SELECT ${ROSTER_COLUMNS} FROM players WHERE key_id = $1 LIMIT 1`,
      [String(keyId)]
    );
    return mapRow(row);
  }

  async search(opts = {}) {
    const { where, params } = this._buildFilter(opts);
    const limit = clampLimit(opts.limit);
    const offset = clampOffset(opts.offset);
    const rows = await queryRows(
      `SELECT ${ROSTER_COLUMNS}
       FROM players ${where}
       ORDER BY lower(name)
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return rows.map(mapRow);
  }

  async count(opts = {}) {
    const { where, params } = this._buildFilter(opts);
    const row = await queryOne(`SELECT COUNT(*)::int AS n FROM players ${where}`, params);
    return row?.n ?? 0;
  }

  byTeam(teamOrAbbr, opts = {}) {
    return this.search({ ...opts, team: teamOrAbbr });
  }

  byPosition(positionAbbr, opts = {}) {
    return this.search({ ...opts, position: positionAbbr });
  }

  /** All active roster rows (paginated internally — not for public list APIs). */
  async allActive() {
    const out = [];
    const pageSize = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.search({ activeOnly: true, limit: pageSize, offset });
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
  async upsert(player) {
    const keyId = String(player.keyId).trim();
    const name = String(player.name).trim();
    const team = String(player.team).trim();
    const teamAbbr = String(player.teamAbbr).trim().toUpperCase();
    const positionAbbr = String(player.positionAbbr).trim().toUpperCase();
    const active = player.active !== false;
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

    await query(
      `INSERT INTO players (
         key_id, name, team, team_abbr, position_abbr,
         gsis_id, sleeper_id, espn_id, headshot_url, opening_price, active, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (key_id) DO UPDATE SET
         name = EXCLUDED.name,
         team = EXCLUDED.team,
         team_abbr = EXCLUDED.team_abbr,
         position_abbr = EXCLUDED.position_abbr,
         gsis_id = EXCLUDED.gsis_id,
         sleeper_id = EXCLUDED.sleeper_id,
         espn_id = EXCLUDED.espn_id,
         headshot_url = EXCLUDED.headshot_url,
         opening_price = EXCLUDED.opening_price,
         active = EXCLUDED.active,
         updated_at = now()`,
      [
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
        active,
      ]
    );

    return this.getByKeyId(keyId);
  }

  _buildFilter(opts = {}) {
    const clauses = [];
    const params = [];

    if (opts.activeOnly !== false) {
      clauses.push("active = true");
    }

    const q = String(opts.q ?? "").trim();
    if (q) {
      const like = `%${q}%`;
      clauses.push(
        `(name ILIKE $${params.length + 1}
          OR team ILIKE $${params.length + 2}
          OR team_abbr ILIKE $${params.length + 3}
          OR position_abbr ILIKE $${params.length + 4}
          OR key_id ILIKE $${params.length + 5})`
      );
      params.push(like, like, like, like, like);
    }

    const team = String(opts.team ?? "").trim();
    if (team) {
      clauses.push(
        `(lower(team_abbr) = lower($${params.length + 1}) OR lower(team) = lower($${params.length + 2}))`
      );
      params.push(team, team);
    }

    const position = opts.position ?? opts.positions;
    if (position != null && position !== "") {
      const list = (Array.isArray(position) ? position : String(position).split(","))
        .map((p) => String(p).trim().toUpperCase())
        .filter(Boolean);
      if (list.length === 1) {
        clauses.push(`position_abbr = $${params.length + 1}`);
        params.push(list[0]);
      } else if (list.length > 1) {
        const marks = list.map((_, index) => `$${params.length + index + 1}`);
        clauses.push(`position_abbr IN (${marks.join(", ")})`);
        params.push(...list);
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return { where, params };
  }
}

export const playerLibrary = new PlayerLibrary();
