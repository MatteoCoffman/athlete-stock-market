#!/usr/bin/env bash
# One-time EAS project link. Run from apps/mobile after creating an Expo account.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! npx eas whoami >/dev/null 2>&1; then
  echo "Not logged in. Starting eas login (browser)…"
  npx eas login
fi

echo "Logged in as: $(npx eas whoami)"
npx eas init
npx eas build:configure
echo "Done. Next: npm run eas:build:android"
