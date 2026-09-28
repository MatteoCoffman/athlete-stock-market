import { SEED_PLAYERS } from "./data/players.js";
import { SHARES_OUTSTANDING } from "./lib/config.js";
import { buildPriceHistory, ensureLongHistory } from "./lib/history.js";
import { loadStore, saveStore } from "./lib/store.js";

const store = loadStore();
let added = 0;
let updated = 0;

for (const p of SEED_PLAYERS) {
  if (!store.players[p.id]) {
    store.players[p.id] = {
      id: p.id,
      name: p.name,
      team: p.team,
      position: p.position,
      price: p.price,
      openPrice: p.price,
      sharesOutstanding: SHARES_OUTSTANDING,
      sharesHeld: 0,
      performanceScore: 0,
      priceHistory: buildPriceHistory(p.price),
    };
    added += 1;
    continue;
  }

  const existing = store.players[p.id];
  const before = existing.priceHistory?.length ?? 0;
  ensureLongHistory(existing);
  if ((existing.priceHistory?.length ?? 0) !== before) updated += 1;
}

saveStore(store);
console.log(
  `Seed complete. Added ${added}, backfilled history on ${updated}. Total: ${Object.keys(store.players).length}`
);
