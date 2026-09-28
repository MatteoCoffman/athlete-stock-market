#!/bin/sh
set -e
cd /app

# Ensure SQLite roster exists (persisted on the data volume)
ROSTER_COUNT=$(node -e "try{const {openDb}=await import('./src/db/index.js');const {playerLibrary}=await import('./src/lib/playerLibrary.js');openDb();process.stdout.write(String(playerLibrary.count({activeOnly:true})))}catch{process.stdout.write('0')}")
if [ "$ROSTER_COUNT" = "0" ]; then
  echo "[entrypoint] Importing roster into SQLite..."
  npm run import-roster
fi

# Seed market store on first boot (empty or missing store)
NEED_SEED=0
if [ ! -f /app/data/store.json ]; then
  NEED_SEED=1
else
  PLAYERS=$(node -e "try{const s=require('./data/store.json');process.stdout.write(String(Object.keys(s.players||{}).length))}catch{process.stdout.write('0')}")
  if [ "$PLAYERS" = "0" ]; then
    NEED_SEED=1
  fi
fi

if [ "$NEED_SEED" = "1" ]; then
  echo "[entrypoint] Seeding market store (npm run reset)..."
  npm run reset
fi

echo "[entrypoint] Starting Jock Exchange API on :${PORT:-4000} (bots=${BOTS_ENABLED:-on})"
exec node src/server.js
