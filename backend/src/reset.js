/**
 * Full wipe: users, holdings, trades, players — then reseed opening prices.
 * Usage: npm run reset
 */
import { SEED_PLAYERS } from "./data/players.js";
import { SHARES_OUTSTANDING } from "./lib/config.js";
import { buildPriceHistory } from "./lib/history.js";
import { saveStore } from "./lib/store.js";

const store = {
  users: {},
  players: {},
  holdings: {},
  trades: [],
};

for (const p of SEED_PLAYERS) {
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
}

saveStore(store);

const priced = SEED_PLAYERS.map((p) => `${p.name} $${p.price}`).join("\n  ");
console.log(`Reset complete.
  Users: 0
  Holdings: 0
  Trades: 0
  Players: ${SEED_PLAYERS.length} (Mahomes base $100)
  ${priced}
`);
