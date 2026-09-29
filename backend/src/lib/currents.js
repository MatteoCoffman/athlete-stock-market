/**
 * Currents News API client.
 * Key stays server-side via CURRENTS_API_KEY. Ready to wrap with a cache later.
 */
import "./config.js";

const CURRENTS_SEARCH_URL = "https://api.currentsapi.services/v1/search";
const FETCH_TIMEOUT_MS = 15_000;

function getApiKey() {
  const key = process.env.CURRENTS_API_KEY?.trim();
  if (!key) {
    const err = new Error("CURRENTS_API_KEY is not configured");
    err.status = 503;
    throw err;
  }
  return key;
}

function parsePublishedMs(published) {
  if (!published) return 0;
  const ms = Date.parse(published);
  return Number.isFinite(ms) ? ms : 0;
}

function inferSource(article) {
  if (article.author && String(article.author).trim()) {
    return String(article.author).trim();
  }
  try {
    const host = new URL(article.url).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

const NAME_SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

function nameParts(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => !NAME_SUFFIXES.has(p.toLowerCase()));
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] || "";
  return { first, last, full: parts.join(" ") };
}

/**
 * Build a tighter Currents keyword query for an NFL player.
 * Quoted full name + NFL, optionally team name.
 */
export function buildPlayerNewsKeywords({ name, team, teamAbbr } = {}) {
  const full = String(name || "").trim();
  if (!full) return "";

  const bits = [`"${full}"`, "NFL"];
  const teamName = String(team || "").trim();
  const abbr = String(teamAbbr || "").trim();
  // Prefer full team name over abbr for search (e.g. "Kansas City Chiefs")
  if (teamName && teamName.toUpperCase() !== abbr.toUpperCase()) {
    bits.push(`"${teamName}"`);
  } else if (abbr) {
    bits.push(abbr);
  }
  return bits.join(" ");
}

/**
 * Score how strongly an article mentions this player (title/snippet only).
 * Returns 0 if it should be dropped.
 */
export function relevanceScore(article, player) {
  const { first, last, full } = nameParts(player?.name);
  if (!last) return 0;

  const hay = `${article.title || ""} ${article._snippet || ""}`.toLowerCase();
  const lastL = last.toLowerCase();
  const firstL = first.toLowerCase();
  const fullL = full.toLowerCase();

  // Require a real name hit: full name, or first+last together (not last-name-only —
  // that pulls in unrelated sports stories for common surnames).
  const hasFull = Boolean(fullL && hay.includes(fullL));
  const hasFirstLast =
    Boolean(firstL) &&
    firstL.length > 1 &&
    hay.includes(firstL) &&
    hay.includes(lastL);
  if (!hasFull && !hasFirstLast) return 0;

  let score = 10;

  if (hasFull) score += 40;
  else score += 25;

  const nflHints = ["nfl", "football", "quarterback", "running back", "wide receiver", "tight end"];
  if (nflHints.some((h) => hay.includes(h))) score += 8;

  const team = String(player?.team || "").toLowerCase();
  const abbr = String(player?.teamAbbr || "").toLowerCase();
  if (team && team !== abbr && hay.includes(team)) score += 12;
  if (abbr && hay.includes(abbr)) score += 6;

  // Prefer title hits over snippet-only
  const title = String(article.title || "").toLowerCase();
  if (title.includes(fullL) || (title.includes(firstL) && title.includes(lastL))) score += 15;
  else if (title.includes(lastL)) score += 5;

  return score;
}

/**
 * Normalize + dedupe Currents news items (no full article text in output).
 * Keeps a private _snippet for relevance scoring only.
 * @param {unknown[]} raw
 */
export function normalizeArticles(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const url = String(item.url || "").trim();
    const id = String(item.id || url || "").trim();
    if (!url || !id) continue;

    const dedupeKey = id || url;
    if (seen.has(dedupeKey) || seen.has(url)) continue;
    seen.add(dedupeKey);
    seen.add(url);

    const title = String(item.title || "").trim();
    if (!title) continue;

    const snippet = String(item.description || item.summary || "").trim();

    out.push({
      id,
      title,
      url,
      image: item.image && String(item.image).trim() ? String(item.image).trim() : null,
      published: item.published ? String(item.published) : null,
      source: inferSource(item),
      _snippet: snippet.slice(0, 400),
    });
  }

  return out;
}

function stripPrivateFields(articles) {
  return articles.map(({ _snippet, ...rest }) => rest);
}

/**
 * Live search Currents for a player, then filter/rank for relevance.
 * @param {{ name: string, team?: string, teamAbbr?: string }} player
 * @param {{ pageSize?: number, limit?: number }} [opts]
 */
export async function searchPlayerNews(player, opts = {}) {
  const name = typeof player === "string" ? player : player?.name;
  const team = typeof player === "string" ? "" : player?.team;
  const teamAbbr = typeof player === "string" ? "" : player?.teamAbbr;
  const keywords = buildPlayerNewsKeywords({ name, team, teamAbbr });
  if (!keywords) return [];

  const pageSize = Math.min(Math.max(Number(opts.pageSize) || 20, 1), 20);
  const limit = Math.min(Math.max(Number(opts.limit) || 4, 1), 10);
  const apiKey = getApiKey();

  const params = new URLSearchParams({
    keywords,
    language: "en",
    category: "sports",
    page_size: String(pageSize),
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${CURRENTS_SEARCH_URL}?${params}`, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(
        `Currents search failed (${res.status})${body ? `: ${body.slice(0, 180)}` : ""}`
      );
      err.status = res.status >= 500 ? 502 : res.status;
      throw err;
    }

    const data = await res.json();
    const news = data?.news ?? data?.articles ?? data;
    const normalized = normalizeArticles(news);
    const playerCtx = { name, team, teamAbbr };

    const ranked = normalized
      .map((article) => ({ article, score: relevanceScore(article, playerCtx) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return parsePublishedMs(b.article.published) - parsePublishedMs(a.article.published);
      })
      .map((row) => row.article);

    // If filters wiped everything, fall back to name-only keyword search once (still sports).
    if (ranked.length === 0 && name) {
      const fallback = await fetchFallbackByName(name, apiKey, pageSize);
      const fbRanked = fallback
        .map((article) => ({ article, score: relevanceScore(article, playerCtx) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return parsePublishedMs(b.article.published) - parsePublishedMs(a.article.published);
        })
        .map((row) => row.article);
      return stripPrivateFields(fbRanked.slice(0, limit));
    }

    return stripPrivateFields(ranked.slice(0, limit));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFallbackByName(name, apiKey, pageSize) {
  const params = new URLSearchParams({
    keywords: `"${String(name).trim()}"`,
    language: "en",
    category: "sports",
    page_size: String(pageSize),
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${CURRENTS_SEARCH_URL}?${params}`, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return normalizeArticles(data?.news ?? data?.articles ?? data);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
