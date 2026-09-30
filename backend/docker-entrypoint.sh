#!/bin/sh
set -e
cd /app

echo "[entrypoint] Applying Postgres migrations..."
npm run db:migrate

ROSTER_COUNT=$(node --input-type=module -e 'import { playerLibrary } from "./src/lib/playerLibrary.js"; process.stdout.write(String(await playerLibrary.count({ activeOnly: true })))')
if [ "$ROSTER_COUNT" = "0" ]; then
  echo "[entrypoint] Importing roster into Postgres..."
  npm run import-roster
fi

# Seed prices only when the market is empty. Do not wipe a database that already has prices.
MARKET_COUNT=$(node --input-type=module -e 'import { countPricedPlayers } from "./src/lib/market.js"; process.stdout.write(String(await countPricedPlayers()))')
if [ "$MARKET_COUNT" = "0" ]; then
  echo "[entrypoint] Seeding market prices from roster..."
  npm run reset
fi

echo "[entrypoint] Starting Jock Exchange API on :${PORT:-4000} (bots=${BOTS_ENABLED:-on})"
exec node src/server.js
