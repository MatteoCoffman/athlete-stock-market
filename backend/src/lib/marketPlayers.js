import { OPENING_PRICES } from "../data/players.js";
import { SHARES_OUTSTANDING } from "./config.js";
import { buildPriceHistory, ensureLongHistory } from "./history.js";
import {
  getPricedPlayer,
  playerPrice,
  withTx,
  writePlayerMarket,
  writePriceHistory,
} from "./market.js";
import { playerLibrary } from "./playerLibrary.js";

function resolveOpeningPrice(rosterPlayer) {
  if (rosterPlayer.openingPrice != null) return rosterPlayer.openingPrice;
  if (OPENING_PRICES[rosterPlayer.keyId] != null) return OPENING_PRICES[rosterPlayer.keyId];
  return 50;
}

function seedMarket(rosterPlayer, price) {
  writePlayerMarket(rosterPlayer.keyId, {
    price,
    openPrice: price,
    sharesOutstanding: SHARES_OUTSTANDING,
    sharesHeld: 0,
    performanceScore: 0,
    history: buildPriceHistory(price),
  });
}

function historySignature(history) {
  const series = Array.isArray(history) ? history : [];
  const last = series[series.length - 1];
  return `${series.length}:${series[0]?.t ?? ""}:${last?.t ?? ""}:${last?.price ?? ""}`;
}

/** Ensure one roster player has a live price. Returns true when a price was created. */
function ensureMarketPlayerInTx(rosterPlayer) {
  if (!rosterPlayer) return false;
  if (playerPrice(rosterPlayer.keyId) != null) return false;
  seedMarket(rosterPlayer, resolveOpeningPrice(rosterPlayer));
  return true;
}

export function ensureMarketPlayer(rosterPlayer) {
  return withTx(() => ensureMarketPlayerInTx(rosterPlayer));
}

export function ensureMarketPlayers(rosterPlayers) {
  return withTx(() => {
    let created = 0;
    for (const rosterPlayer of rosterPlayers) {
      if (ensureMarketPlayerInTx(rosterPlayer)) created += 1;
    }
    return created;
  });
}

export function syncMarketPlayers({ rebuildHistory = false } = {}) {
  return withTx(() => {
    const roster = playerLibrary.allActive();
    let added = 0;
    let synced = 0;
    for (const rosterPlayer of roster) {
      const price = resolveOpeningPrice(rosterPlayer);
      const existing = playerPrice(rosterPlayer.keyId);
      if (existing == null) {
        seedMarket(rosterPlayer, price);
        added += 1;
        continue;
      }
      if (rebuildHistory) seedMarket(rosterPlayer, price);
      synced += 1;
    }
    return { added, synced, total: roster.length };
  });
}

export function backfillLongHistories() {
  return withTx(() => {
    const roster = playerLibrary.allActive();
    let updated = 0;
    for (const rosterPlayer of roster) {
      const priced = getPricedPlayer(rosterPlayer.keyId);
      if (!priced) continue;
      const before = historySignature(priced.priceHistory);
      const draft = { price: priced.price, priceHistory: priced.priceHistory };
      ensureLongHistory(draft);
      if (historySignature(draft.priceHistory) === before) continue;
      writePriceHistory(rosterPlayer.keyId, draft.priceHistory);
      updated += 1;
    }
    return updated;
  });
}

export function mergeRosterWithMarket(rosterPlayer, marketPlayer) {
  if (!rosterPlayer) return null;
  if (!marketPlayer) return null;
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
