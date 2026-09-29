#!/bin/sh
set -e
cd /app

# Ensure SQLite roster exists (persisted on the data volume)
ROSTER_COUNT=$(node -e "try{const {openDb}=await import('./src/db/index.js');const {playerLibrary}=await import('./src/lib/playerLibrary.js');openDb();process.stdout.write(String(playerLibrary.count({activeOnly:true})))}catch{process.stdout.write('0')}")
if [ "$ROSTER_COUNT" = "0" ]; then
  echo "[entrypoint] Importing roster into SQLite..."
  npm run import-roster
fi

# Seed prices only when the market is empty. A missing store.json must not wipe jock.db.
MARKET_COUNT=$(node -e "try{const {openDb}=await import('./src/db/index.js');const {countPricedPlayers}=await import('./src/lib/market.js');openDb();process.stdout.write(String(countPricedPlayers()))}catch{process.stdout.write('0')}")
if [ "$MARKET_COUNT" = "0" ]; then
  if [ -f /app/data/store.json ]; then
    echo "[entrypoint] Importing store.json into jock.db..."
    node src/import-market.js
  else
    echo "[entrypoint] Seeding market prices from roster..."
    npm run reset
  fi
fi

echo "[entrypoint] Starting Jock Exchange API on :${PORT:-4000} (bots=${BOTS_ENABLED:-on})"
exec node src/server.js
