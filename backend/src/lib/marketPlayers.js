import { OPENING_PRICES, SEED_PLAYERS } from "../data/players.js";
import { SHARES_OUTSTANDING } from "./config.js";
import { buildPriceHistory } from "./history.js";
import { playerLibrary } from "./playerLibrary.js";

function buildMarketRow(rosterPlayer, price) {
  return {
    id: rosterPlayer.keyId,
    name: rosterPlayer.name,
    team: rosterPlayer.teamAbbr,
    position: rosterPlayer.positionAbbr,
    price,
    openPrice: price,
    sharesOutstanding: SHARES_OUTSTANDING,
    sharesHeld: 0,
    performanceScore: 0,
    priceHistory: buildPriceHistory(price),
    gsisId: rosterPlayer.gsisId,
    sleeperId: rosterPlayer.sleeperId,
    headshotUrl: rosterPlayer.headshotUrl,
  };
}

function resolveOpeningPrice(rosterPlayer) {
  if (rosterPlayer.openingPrice != null) return rosterPlayer.openingPrice;
  if (OPENING_PRICES[rosterPlayer.keyId] != null) return OPENING_PRICES[rosterPlayer.keyId];
  return 50;
}

/** Ensure a single market row exists. Returns true if store mutated. */
export function ensureMarketPlayer(store, rosterPlayer) {
  if (!rosterPlayer) return false;
  const existing = store.players[rosterPlayer.keyId];
  if (!existing) {
    store.players[rosterPlayer.keyId] = buildMarketRow(
      rosterPlayer,
      resolveOpeningPrice(rosterPlayer)
    );
    return true;
  }

  let changed = false;
  const sync = (field, value) => {
    if (value == null) return;
    if (existing[field] !== value) {
      existing[field] = value;
      changed = true;
    }
  };
  sync("name", rosterPlayer.name);
  sync("team", rosterPlayer.teamAbbr);
  sync("position", rosterPlayer.positionAbbr);
  sync("gsisId", rosterPlayer.gsisId);
  sync("sleeperId", rosterPlayer.sleeperId);
  sync("headshotUrl", rosterPlayer.headshotUrl);
  return changed;
}

export function syncMarketPlayers(store, { rebuildHistory = false } = {}) {
  const roster = playerLibrary.allActive();
  let added = 0;
  let synced = 0;

  for (const p of roster) {
    const price = resolveOpeningPrice(p);
    const existing = store.players[p.keyId];
    if (!existing) {
      store.players[p.keyId] = buildMarketRow(p, price);
      added += 1;
      continue;
    }
    ensureMarketPlayer(store, p);
    if (rebuildHistory) {
      existing.price = price;
      existing.openPrice = price;
      existing.sharesOutstanding = SHARES_OUTSTANDING;
      existing.sharesHeld = 0;
      existing.performanceScore = 0;
      existing.priceHistory = buildPriceHistory(price);
    }
    synced += 1;
  }

  return { added, synced, total: roster.length };
}

export function mergeRosterWithMarket(rosterPlayer, marketPlayer) {
  if (!rosterPlayer) return null;
  if (!marketPlayer) {
    const price = resolveOpeningPrice(rosterPlayer);
    return buildMarketRow(rosterPlayer, price);
  }
  return {
    ...marketPlayer,
    id: rosterPlayer.keyId,
    name: rosterPlayer.name,
    team: rosterPlayer.teamAbbr,
    position: rosterPlayer.positionAbbr,
    gsisId: rosterPlayer.gsisId,
    sleeperId: rosterPlayer.sleeperId,
    headshotUrl: rosterPlayer.headshotUrl,
  };
}

/** Price lookup used when SQL is empty fallback — seed file keyed by id. */
export { SEED_PLAYERS };
