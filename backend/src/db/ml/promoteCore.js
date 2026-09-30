/**
 * Copy the latest raw sheet rows into typed core tables.
 * Blank and N/A cells become null. A bad required field skips the row.
 * A bad optional field is stored as null and reported.
 */
import { assertMlDatabaseName, getClient } from "./client.js";
import {
  ACCOLADE_FIELDS,
  COLLEGE_FIELDS,
  COLLEGE_RAW_TABLES,
  COMBINE_FIELDS,
  DRAFT_FIELDS,
  OFFENSE_FIELDS,
  OFFENSE_RAW_SOURCE,
  PLAYER_FIELDS,
} from "./tables.js";
import { parseTyped } from "./values.js";

const WARN_LIMIT = 25;

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return name;
}

/**
 * @param {Record<string, unknown>} raw
 * @param {Record<string, object>} fields
 * @param {Record<string, string>} [sources]
 */
export function readFields(raw, fields, sources = {}) {
  /** @type {Record<string, unknown>} */
  const values = {};
  /** @type {string[]} */
  const warnings = [];
  for (const [column, spec] of Object.entries(fields)) {
    const source = sources[column] || column;
    const parsed = parseTyped(raw[source], spec);
    if (!parsed.ok) {
      values[column] = null;
      warnings.push(`${column} ${parsed.reason} left null`);
      continue;
    }
    values[column] = parsed.value;
  }
  return { values, warnings };
}

function hasValue(values, columns) {
  return columns.some((column) => values[column] != null);
}

async function latestRows(client, table, keySql) {
  const { rows } = await client.query(
    `SELECT DISTINCT ON (${keySql}) *
     FROM raw.${quoteIdent(table)}
     ORDER BY ${keySql}, raw_row_id DESC`
  );
  return rows;
}

function rowLabel(row) {
  if (row.player_id) return String(row.player_id);
  if (row.nfl_team_id != null) {
    return `team ${row.nfl_team_id}${row.season != null ? ` season ${row.season}` : ""}`;
  }
  return "row";
}

async function upsert(client, table, conflict, rows, bucket) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const updates = columns
    .filter((column) => !conflict.includes(column))
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
  updates.push("updated_at = CURRENT_TIMESTAMP");

  const write = async (chunk) => {
    const values = [];
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const sql = `
      INSERT INTO core.${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})
      VALUES ${tuples.join(", ")}
      ON CONFLICT (${conflict.map(quoteIdent).join(", ")})
      DO UPDATE SET ${updates.join(", ")}
    `;
    await client.query(sql, values);
  };

  const writeOne = async (row) => {
    await client.query("SAVEPOINT core_row");
    try {
      await write([row]);
      await client.query("RELEASE SAVEPOINT core_row");
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT core_row");
      bucket.sqlFailed += 1;
      pushWarning(bucket, `${table} ${rowLabel(row)}: ${err.message}`);
    }
  };

  const size = 100;
  for (let start = 0; start < rows.length; start += size) {
    const chunk = rows.slice(start, start + size);
    await client.query("SAVEPOINT core_chunk");
    try {
      await write(chunk);
      await client.query("RELEASE SAVEPOINT core_chunk");
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT core_chunk");
      for (const row of chunk) await writeOne(row);
    }
  }
}

function pushWarning(bucket, message) {
  bucket.warnings.push(message);
}

function finish(bucket) {
  const failed = bucket.sqlFailed || 0;
  return {
    upserted: bucket.rows.length - failed,
    skipped: bucket.skipped + failed,
    warnings: bucket.warnings,
  };
}

async function promoteTeams(client) {
  const bucket = { rows: [], skipped: 0, sqlFailed: 0, warnings: [] };
  const rawRows = await latestRows(client, "nfl_team_reference_table", "btrim(nfl_team_id)");
  for (const raw of rawRows) {
    const id = parseTyped(raw.nfl_team_id, { kind: "smallint", positive: true });
    const name = parseTyped(raw.nfl_team, { kind: "text" });
    const abbr = parseTyped(raw.nfl_abbreviation, { kind: "text", maxLength: 5 });
    const label = `team ${cleanLabel(raw.nfl_team_id)}`;
    if (!id.ok || id.value == null) {
      bucket.skipped += 1;
      pushWarning(bucket, `${label}: nfl_team_id ${id.ok ? "is blank" : id.reason}`);
      continue;
    }
    if (!name.ok || name.value == null) {
      bucket.skipped += 1;
      pushWarning(bucket, `${label}: nfl_team ${name.ok ? "is blank" : name.reason}`);
      continue;
    }
    if (!abbr.ok || abbr.value == null) {
      bucket.skipped += 1;
      pushWarning(bucket, `${label}: nfl_abbreviation ${abbr.ok ? "is blank" : abbr.reason}`);
      continue;
    }
    bucket.rows.push({
      nfl_team_id: id.value,
      nfl_team: name.value,
      nfl_abbreviation: abbr.value,
    });
  }
  await upsert(client, "nfl_teams", ["nfl_team_id"], bucket.rows, bucket);
  return finish(bucket);
}

async function promotePlayers(client) {
  const bucket = { rows: [], skipped: 0, sqlFailed: 0, warnings: [] };
  const rawRows = await latestRows(client, "player_input_table", "btrim(player_id)");
  for (const raw of rawRows) {
    const playerId = cleanLabel(raw.player_id);
    if (!playerId) {
      bucket.skipped += 1;
      continue;
    }
    const read = readFields(raw, PLAYER_FIELDS);
    const label = `player ${playerId}`;
    if (read.values.full_name == null) {
      bucket.skipped += 1;
      pushWarning(bucket, `${label}: full_name is blank`);
      continue;
    }
    if (read.values.position == null) {
      bucket.skipped += 1;
      const why = read.warnings.find((line) => line.startsWith("position "));
      const reason = why ? why.replace(/ left null$/, "") : "position is blank";
      pushWarning(bucket, `${label}: skipped, ${reason}`);
      continue;
    }
    for (const warning of read.warnings) {
      if (warning.startsWith("position ") || warning.startsWith("full_name ")) continue;
      pushWarning(bucket, `${label}: ${warning}`);
    }
    bucket.rows.push({ player_id: playerId, ...read.values });
  }
  await upsert(client, "players", ["player_id"], bucket.rows, bucket);
  return finish(bucket);
}

async function promoteDrafts(client, playerIds, teamIds) {
  const bucket = { rows: [], skipped: 0, sqlFailed: 0, warnings: [] };
  const rawRows = await latestRows(client, "player_input_table", "btrim(player_id)");
  for (const raw of rawRows) {
    const playerId = cleanLabel(raw.player_id);
    if (!playerId || !playerIds.has(playerId)) continue;
    const read = readFields(raw, DRAFT_FIELDS);
    if (!hasValue(read.values, Object.keys(DRAFT_FIELDS))) continue;
    if (read.values.draft_team_id != null && !teamIds.has(read.values.draft_team_id)) {
      pushWarning(
        bucket,
        `player ${playerId}: draft_team_id ${read.values.draft_team_id} is not in core.nfl_teams; left null`
      );
      read.values.draft_team_id = null;
    }
    for (const warning of read.warnings) pushWarning(bucket, `player ${playerId}: ${warning}`);
    if (!hasValue(read.values, Object.keys(DRAFT_FIELDS))) {
      bucket.skipped += 1;
      continue;
    }
    bucket.rows.push({ player_id: playerId, ...read.values });
  }
  await upsert(client, "player_draft", ["player_id"], bucket.rows, bucket);
  return finish(bucket);
}

async function promoteCollege(client, playerIds) {
  const bucket = { rows: [], skipped: 0, sqlFailed: 0, warnings: [] };
  /** @type {Map<string, { row: object, rank: number, warnings: string[] }>} */
  const byKey = new Map();

  for (const [tableIndex, table] of COLLEGE_RAW_TABLES.entries()) {
    const rawRows = await latestRows(client, table, "btrim(player_id), btrim(season)");
    for (const raw of rawRows) {
      const playerId = cleanLabel(raw.player_id);
      const season = parseTyped(raw.season, { kind: "smallint" });
      const school = parseTyped(raw.school, { kind: "text" });
      const label = `${table} ${playerId || "(blank)"}`;
      if (!playerId) {
        bucket.skipped += 1;
        continue;
      }
      if (!playerIds.has(playerId)) {
        bucket.skipped += 1;
        pushWarning(bucket, `${label}: no matching core player`);
        continue;
      }
      if (!season.ok || season.value == null) {
        bucket.skipped += 1;
        pushWarning(bucket, `${label}: season ${season.ok ? "is blank" : season.reason}`);
        continue;
      }
      if (!school.ok || school.value == null) {
        bucket.skipped += 1;
        pushWarning(bucket, `${label}: school ${school.ok ? "is blank" : school.reason}`);
        continue;
      }
      const read = readFields(raw, COLLEGE_FIELDS);
      const key = `${playerId}|${season.value}`;
      const importedAt = raw.imported_at ? new Date(raw.imported_at).getTime() : 0;
      const next = {
        row: { player_id: playerId, season: season.value, school: school.value, ...read.values },
        rank: importedAt * 100 + tableIndex,
        warnings: read.warnings.map((warning) => `${label}: ${warning}`),
      };
      const prev = byKey.get(key);
      if (prev && next.rank < prev.rank) {
        pushWarning(bucket, `${label}: kept a newer ${key} row from another sheet`);
        continue;
      }
      if (prev) pushWarning(bucket, `${label}: replaced an older ${key} row`);
      byKey.set(key, next);
    }
  }

  for (const item of byKey.values()) {
    for (const warning of item.warnings) pushWarning(bucket, warning);
    bucket.rows.push(item.row);
  }
  await upsert(client, "player_college_seasons", ["player_id", "season"], bucket.rows, bucket);
  return finish(bucket);
}

async function promoteCombine(client, playerIds) {
  return promotePlayerChild(client, {
    table: "player_combine_measurables",
    core: "player_combine_measurables",
    fields: COMBINE_FIELDS,
    playerIds,
  });
}

async function promoteAccolades(client, playerIds) {
  return promotePlayerChild(client, {
    table: "player_college_accolades",
    core: "player_college_accolades",
    fields: ACCOLADE_FIELDS,
    playerIds,
  });
}

async function promotePlayerChild(client, { table, core, fields, playerIds }) {
  const bucket = { rows: [], skipped: 0, sqlFailed: 0, warnings: [] };
  const rawRows = await latestRows(client, table, "btrim(player_id)");
  const fieldNames = Object.keys(fields);
  for (const raw of rawRows) {
    const playerId = cleanLabel(raw.player_id);
    if (!playerId) {
      bucket.skipped += 1;
      continue;
    }
    if (!playerIds.has(playerId)) {
      bucket.skipped += 1;
      pushWarning(bucket, `${table} ${playerId}: no matching core player`);
      continue;
    }
    const read = readFields(raw, fields);
    if (!hasValue(read.values, fieldNames)) continue;
    for (const warning of read.warnings) pushWarning(bucket, `${table} ${playerId}: ${warning}`);
    if (!hasValue(read.values, fieldNames)) {
      bucket.skipped += 1;
      continue;
    }
    bucket.rows.push({ player_id: playerId, ...read.values });
  }
  await upsert(client, core, ["player_id"], bucket.rows, bucket);
  return finish(bucket);
}

async function promoteOffense(client, teamIds) {
  const bucket = { rows: [], skipped: 0, sqlFailed: 0, warnings: [] };
  const rawRows = await latestRows(
    client,
    "nfl_team_offensive_performance",
    "btrim(nfl_team_id), btrim(season)"
  );
  for (const raw of rawRows) {
    const teamId = parseTyped(raw.nfl_team_id, { kind: "smallint", positive: true });
    const season = parseTyped(raw.season, { kind: "smallint" });
    const label = `offense team ${cleanLabel(raw.nfl_team_id)}`;
    if (!teamId.ok || teamId.value == null) {
      bucket.skipped += 1;
      pushWarning(bucket, `${label}: nfl_team_id ${teamId.ok ? "is blank" : teamId.reason}`);
      continue;
    }
    if (!teamIds.has(teamId.value)) {
      bucket.skipped += 1;
      pushWarning(bucket, `${label}: nfl_team_id ${teamId.value} is not in core.nfl_teams`);
      continue;
    }
    if (!season.ok || season.value == null) {
      bucket.skipped += 1;
      pushWarning(bucket, `${label}: season ${season.ok ? "is blank" : season.reason}`);
      continue;
    }
    const read = readFields(raw, OFFENSE_FIELDS, OFFENSE_RAW_SOURCE);
    for (const warning of read.warnings) pushWarning(bucket, `${label} ${season.value}: ${warning}`);
    bucket.rows.push({ nfl_team_id: teamId.value, season: season.value, ...read.values });
  }
  await upsert(client, "nfl_team_offensive_seasons", ["nfl_team_id", "season"], bucket.rows, bucket);
  return finish(bucket);
}

async function idSet(client, sql) {
  const { rows } = await client.query(sql);
  return new Set(
    rows.map((row) => {
      if (typeof row.id === "string" && /^-?\d+$/.test(row.id)) return Number(row.id);
      return row.id;
    })
  );
}

async function clearCore(client) {
  await client.query("DELETE FROM core.nfl_team_offensive_seasons");
  await client.query("DELETE FROM core.player_college_accolades");
  await client.query("DELETE FROM core.player_combine_measurables");
  await client.query("DELETE FROM core.player_college_seasons");
  await client.query("DELETE FROM core.player_draft");
  await client.query("DELETE FROM core.players");
  await client.query("DELETE FROM core.nfl_teams");
}

function cleanLabel(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {{ rebuild?: boolean }} [opts]
 */
export async function promoteCore({ rebuild = false } = {}) {
  assertMlDatabaseName();
  const client = await getClient();
  try {
    await client.query("BEGIN");
    if (rebuild) await clearCore(client);

    const teams = await promoteTeams(client);
    const players = await promotePlayers(client);
    const playerIds = await idSet(client, "SELECT player_id AS id FROM core.players");
    const teamIds = await idSet(client, "SELECT nfl_team_id AS id FROM core.nfl_teams");
    const drafts = await promoteDrafts(client, playerIds, teamIds);
    const college = await promoteCollege(client, playerIds);
    const combine = await promoteCombine(client, playerIds);
    const accolades = await promoteAccolades(client, playerIds);
    const offense = await promoteOffense(client, teamIds);

    await client.query("COMMIT");
    return { teams, players, drafts, college, combine, accolades, offense };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function formatReport(report) {
  const lines = [];
  for (const [name, result] of Object.entries(report)) {
    lines.push(
      `${name}: ${result.upserted} upserted, ${result.skipped} skipped, ${result.warnings.length} warning(s)`
    );
    const shown = result.warnings.slice(0, WARN_LIMIT);
    for (const warning of shown) lines.push(`  ${warning}`);
    if (result.warnings.length > WARN_LIMIT) {
      lines.push(`  ... ${result.warnings.length - WARN_LIMIT} more`);
    }
  }
  return lines.join("\n");
}
