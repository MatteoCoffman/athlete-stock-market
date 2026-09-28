/**
 * Build backend/src/data/roster.json from nflverse roster_2026.csv
 * Active offense only: QB / RB / WR / TE
 *
 * Usage: npm run roster  (from backend/)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "roster_2026.csv");
const OUT_PATH = path.join(__dirname, "roster.json");

const OFFENSE = new Set(["QB", "RB", "WR", "TE"]);

/** Demo opening prices we already tuned (name → price). Mahomes stays $100. */
const LEGACY_PRICES = {
  "Josh Allen": 108,
  "Lamar Jackson": 102,
  "Patrick Mahomes": 100,
  "Joe Burrow": 88,
  "Jalen Hurts": 84,
  "Christian McCaffrey": 96,
  "Saquon Barkley": 92,
  "Bijan Robinson": 88,
  "Jahmyr Gibbs": 86,
  "Derrick Henry": 78,
  "Ja'Marr Chase": 98,
  "Justin Jefferson": 96,
  "CeeDee Lamb": 90,
  "Amon-Ra St. Brown": 87,
  "A.J. Brown": 84,
  "Malik Nabers": 82,
  "Nico Collins": 80,
  "Tyreek Hill": 72,
  "Brock Bowers": 85,
  "Trey McBride": 74,
  "Travis Kelce": 70,
  "George Kittle": 68,
  "Sam LaPorta": 64,
};

const POSITION_BASE = {
  QB: 55,
  RB: 42,
  WR: 40,
  TE: 36,
};

function slugId(gsisId, fullName, team) {
  if (gsisId && gsisId.trim()) {
    return `gsis-${gsisId.trim()}`;
  }
  const slug = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-${team.toLowerCase()}`;
}

function openingPrice(name, position) {
  if (LEGACY_PRICES[name] != null) return LEGACY_PRICES[name];
  return POSITION_BASE[position] ?? 35;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`Missing ${CSV_PATH}`);
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));

const filtered = rows.filter(
  (r) => OFFENSE.has(r.position) && r.status === "ACT" && (r.full_name || "").trim()
);

const byId = new Map();
for (const r of filtered) {
  const key = r.gsis_id || `${r.full_name}|${r.team}|${r.position}`;
  const week = Number(r.week) || 0;
  const prev = byId.get(key);
  if (!prev || week >= (Number(prev.week) || 0)) byId.set(key, r);
}

const roster = [...byId.values()]
  .map((r) => {
    const name = r.full_name.trim();
    const team = r.team.trim();
    const position = r.position.trim();
    return {
      id: slugId(r.gsis_id, name, team),
      name,
      team,
      position,
      price: openingPrice(name, position),
      gsisId: r.gsis_id || null,
      headshotUrl: r.headshot_url || null,
    };
  })
  .sort((a, b) => {
    if (a.position !== b.position) return a.position.localeCompare(b.position);
    if (b.price !== a.price) return b.price - a.price;
    return a.name.localeCompare(b.name);
  });

fs.writeFileSync(OUT_PATH, `${JSON.stringify(roster, null, 2)}\n`);

const byPos = roster.reduce((acc, p) => {
  acc[p.position] = (acc[p.position] || 0) + 1;
  return acc;
}, {});
const mahomes = roster.find((p) => p.name === "Patrick Mahomes");

console.log(`Wrote ${roster.length} players → ${OUT_PATH}`);
console.log("By position:", byPos);
console.log(
  "Mahomes:",
  mahomes ? `${mahomes.id} $${mahomes.price}` : "NOT FOUND — check name spelling"
);
