const SLEEPER_BASE = "https://api.sleeper.app/v1";
const FETCH_TIMEOUT_MS = 12_000;

async function sleeperFetch(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SLEEPER_BASE}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const err = new Error(`Sleeper ${path} failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * NFL state: { season, week, season_type, ... }
 * https://docs.sleeper.com/#get-nfl-state
 */
export async function getNflState() {
  return sleeperFetch("/state/nfl");
}

/**
 * Week stats map keyed by sleeper player id.
 * https://docs.sleeper.com/#get-nfl-week-stats
 * @param {number|string} season
 * @param {number|string} week
 * @param {string} [seasonType]
 */
export async function fetchWeekStats(season, week, seasonType = "regular") {
  const data = await sleeperFetch(`/stats/nfl/${seasonType}/${season}/${week}`);
  return data && typeof data === "object" ? data : {};
}

/** Numeric fields we care about for profile cards (no fantasy scoring). */
export const STAT_KEYS = [
  "pass_yd",
  "pass_td",
  "pass_int",
  "pass_att",
  "pass_cmp",
  "rush_yd",
  "rush_td",
  "rush_att",
  "rec",
  "rec_yd",
  "rec_td",
];

export function pickStatFields(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const key of STAT_KEYS) {
    if (raw[key] != null && Number.isFinite(Number(raw[key]))) {
      out[key] = Number(raw[key]);
    }
  }
  return out;
}

export function sumStats(rows) {
  const total = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      total[k] = (total[k] || 0) + Number(v || 0);
    }
  }
  return total;
}

/**
 * Basic football stats for profile chips. Omits null / zero values.
 * @param {string} position
 * @param {Record<string, number>} stats
 */
export function statChipsForPosition(position, stats) {
  const pos = String(position || "").toUpperCase();
  const s = stats || {};

  /** @type {Array<[string, number|undefined|null]>} */
  let candidates;
  if (pos === "QB") {
    candidates = [
      ["Pass Yds", s.pass_yd],
      ["Pass TD", s.pass_td],
      ["INT", s.pass_int],
      ["Rush Att", s.rush_att],
      ["Rush Yds", s.rush_yd],
      ["Rush TD", s.rush_td],
    ];
  } else if (pos === "RB") {
    candidates = [
      ["Rush Att", s.rush_att],
      ["Rush Yds", s.rush_yd],
      ["Rush TD", s.rush_td],
      ["Rec", s.rec],
      ["Rec Yds", s.rec_yd],
      ["Rec TD", s.rec_td],
    ];
  } else {
    // WR / TE — still include rush if they had a jet sweep / gadget play
    candidates = [
      ["Rec", s.rec],
      ["Rec Yds", s.rec_yd],
      ["Rec TD", s.rec_td],
      ["Rush Att", s.rush_att],
      ["Rush Yds", s.rush_yd],
      ["Rush TD", s.rush_td],
    ];
  }

  return candidates
    .filter(([, value]) => value != null && Number(value) !== 0 && Number.isFinite(Number(value)))
    .map(([label, value]) => ({
      label,
      value: Number(value).toFixed(0),
    }));
}
