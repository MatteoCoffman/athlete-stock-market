/**
 * Import roster into Postgres `players`.
 *
 * Usage:
 *   npm run import-roster
 *   npm run import-roster -- path/to/roster.json
 *   npm run import-roster -- path/to/roster_2026.csv
 *
 * Default: backend/src/data/roster.json (from `npm run roster`)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SEED_PLAYERS } from "./data/players.js";
import { teamFullName } from "./data/teams.js";
import { closePool } from "./db/pg/client.js";
import { PlayerLibrary } from "./lib/playerLibrary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROSTER = path.join(__dirname, "data", "roster.json");

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}

function slugId(gsisId, fullName, team) {
  if (gsisId) return `gsis-${gsisId}`;
  const slug = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-${String(team).toLowerCase()}`;
}

function normalizeRow(raw) {
  const teamAbbr = pick(raw, "teamAbbr", "team_abbr", "team", "Team").toUpperCase();
  const name = pick(raw, "name", "full_name", "playerName", "fullName");
  const positionAbbr = pick(
    raw,
    "positionAbbr",
    "position_abbr",
    "position",
    "Position"
  ).toUpperCase();
  const gsisId = pick(raw, "gsisId", "gsis_id") || null;
  const sleeperId = pick(raw, "sleeperId", "sleeper_id") || null;
  const espnId = pick(raw, "espnId", "espn_id") || null;
  const headshotUrl = pick(raw, "headshotUrl", "headshot_url") || null;
  const teamName = pick(raw, "teamName", "team_name");
  const team = teamName || teamFullName(teamAbbr) || teamAbbr;
  let keyId = pick(raw, "keyId", "key_id", "id");
  if (!keyId && name) keyId = slugId(gsisId, name, teamAbbr);

  const priceRaw = pick(raw, "price", "openingPrice", "opening_price");
  const openingPrice = priceRaw ? Number(priceRaw) : null;

  if (!keyId || !name || !team || !teamAbbr || !positionAbbr) {
    throw new Error(`Invalid roster row: ${JSON.stringify(raw)}`);
  }

  return {
    keyId,
    name,
    team,
    teamAbbr,
    positionAbbr,
    gsisId,
    sleeperId,
    espnId,
    headshotUrl,
    openingPrice: Number.isFinite(openingPrice) ? openingPrice : null,
    active: true,
  };
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

function loadRows(filePath) {
  if (!filePath) {
    return SEED_PLAYERS.map(normalizeRow);
  }

  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Roster file not found: ${abs}`);
  }

  const text = fs.readFileSync(abs, "utf8");
  const ext = path.extname(abs).toLowerCase();

  if (ext === ".json") {
    const parsed = JSON.parse(text);
    const rawRows = Array.isArray(parsed) ? parsed : parsed.players;
    if (!Array.isArray(rawRows)) {
      throw new Error("JSON roster must be an array or { players: [...] }");
    }
    return rawRows.map(normalizeRow);
  }

  if (ext === ".csv") {
    const OFFENSE = new Set(["QB", "RB", "WR", "TE"]);
    const rows = parseCsv(text).filter(
      (r) => OFFENSE.has(String(r.position || "").trim()) && String(r.status || "") === "ACT"
    );
    // Keep latest week per gsis_id
    const byId = new Map();
    for (const r of rows) {
      const key = r.gsis_id || `${r.full_name}|${r.team}|${r.position}`;
      const week = Number(r.week) || 0;
      const prev = byId.get(key);
      if (!prev || week >= (Number(prev.week) || 0)) byId.set(key, r);
    }
    return [...byId.values()].map(normalizeRow);
  }

  throw new Error(`Unsupported roster format: ${ext} (use .json or .csv)`);
}

const fileArg = process.argv[2] || (fs.existsSync(DEFAULT_ROSTER) ? DEFAULT_ROSTER : null);

try {
  const library = new PlayerLibrary();
  const rows = loadRows(fileArg);

  let upserted = 0;
  for (const row of rows) {
    await library.upsert(row);
    upserted += 1;
  }

  const active = await library.allActive();
  const withSleeper = active.filter((p) => p.sleeperId).length;

  console.log(
    `Import complete. Upserted ${upserted} players` +
      (fileArg ? ` from ${path.resolve(fileArg)}` : " (SEED_PLAYERS)")
  );
  console.log(`Active: ${active.length} · with sleeper_id: ${withSleeper}`);
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
