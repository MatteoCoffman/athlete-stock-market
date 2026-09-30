# Jock Exchange

Stock market for NFL athletes — buy and sell shares with virtual credits, earn stub performance dividends.

## What's running (prototype)

- **Expo app** (`apps/mobile`) — navy + orange UI for web / iOS / Android (**Expo SDK 57**, matches current Expo Go)
- **Local API** (`backend`) — Express + JWT auth + Postgres `athlete_market_app` + bots; `athlete_market_ml` for research (see [docs/DATABASE.md](docs/DATABASE.md)). The deployed site still uses SQLite on EC2 until a later cutover.
- **Shared deploy** — EC2 `t3.micro` (Docker + bots) + Cloudflare Tunnel HTTPS + **Vercel** web — see [docs/DEPLOY.md](docs/DEPLOY.md)
- **Native installs** — EAS Build → TestFlight / Play Internal (no Metro) — see [docs/MOBILE.md](docs/MOBILE.md)
- **AWS CDK** (`infra`) — `JockExchangeMarketStack` (always-on market) and legacy `JockExchangeStack` (Lambda/Dynamo skeleton, not required for bots)

New accounts receive **100,000** virtual credits. Trading uses instant market orders with price impact against a fixed 10,000-share float per player.

## Quick start

### 1. Backend

```bash
cd backend
npm install
npm run reset   # wipe users/trades/holdings + reseed from roster.json
# Optional: rebuild roster.json from CSV after updating the dump
# npm run roster

npm start
```

Or from the repo root: `npm run backend:reset` then `npm run backend`.

API: http://localhost:4000  
Health: `GET /health`

On start, the API launches a **bot market** (12 bots by default) that buys/sells through the real trade engine so prices, % chips, and charts move on their own. Bots only run while this process is up. Disable with `BOTS_ENABLED=0`.

```bash
BOTS_ENABLED=0 npm start          # humans only
BOT_COUNT=20 BOT_INTERVAL_MS=1500 npm start
```

### 2. Mobile / web app

```bash
cd apps/mobile
npm install
npm run web          # browser
# or: npm start      # Expo Go / simulator
```

The app auto-targets the API on the same machine as Metro (LAN IP for phones, `localhost` for web / iOS simulator). Keep the backend running on port **4000**.

For a **hosted** API, set `EXPO_PUBLIC_API_URL` (see `.env.example` and [docs/DEPLOY.md](docs/DEPLOY.md)).

### Demo path

1. Create an account (gets 100k credits)
2. **Portfolio** tab (home) — holdings + popular movers
3. **Search** tab — find players, sorted by movers by default
4. Open a player → large chart + Buy / Sell
5. **Account** — cash + logout

### Paying dividends (admin / outside the app)

Dividends are **not** exposed in the mobile UI. Trigger them from the backend:

```bash
cd backend
npm run dividend -- gsis-00-0033873 2
# (use a real player id from roster.json / Search)
```

Or via API:

```bash
curl -X POST http://localhost:4000/dividends/pay \
  -H "Content-Type: application/json" \
  -H "x-admin-token: jock-admin-demo" \
  -d '{"playerId":"gsis-00-0033873","payoutPerShare":1.5}'
```

Default admin token: `jock-admin-demo`

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | — | Create user + starting cash |
| POST | `/auth/login` | — | Login |
| GET | `/auth/me` | Bearer | Current user |
| GET | `/players` | — | NFL offense market |
| GET | `/players/:id` | — | Player + recent trades |
| POST | `/trades` | Bearer | `{ playerId, side: "buy"\|"sell", qty }` |
| GET | `/portfolio` | Bearer | Cash + positions |
| POST | `/dividends/pay` | `x-admin-token` | Pay holders `payoutPerShare` |
| POST | `/dividends/score` | `x-admin-token` | Set performance score |

Admin dividend endpoints use token `jock-admin-demo` (CLI/API only — not shown in the app).

## Shared deploy (AWS + Vercel)

Full steps: **[docs/DEPLOY.md](docs/DEPLOY.md)**

Summary:

```bash
# 1) EC2 market + bots (~$5–10/mo). Set budget email!
cd infra && npm install && npx cdk bootstrap
JOCK_BUDGET_EMAIL=you@example.com npm run deploy:market

# 2) Cloudflare Tunnel → http://127.0.0.1:4000 (HTTPS URL for the app)

# 3) Vercel: root apps/mobile, env EXPO_PUBLIC_API_URL=https://<tunnel-host>
```

Pause costs: stop the EC2 instance, or `cd infra && npm run destroy:market`.

## Branches

| Branch | Purpose |
|--------|---------|
| `master` | Stable (protected) |
| `alpha` | Active prototype work |
| `beta` | Pre-release |
| `db-post-migration` | Local API on Postgres `athlete_market_app` (do not deploy this image to the current EC2) |

## PostgreSQL

The local API reads `DATABASE_URL` and will not start without it. ML research uses `ML_DATABASE_URL` → `athlete_market_ml`. See **[docs/DATABASE.md](docs/DATABASE.md)**. jockex.dev is still the EC2 SQLite market.

```bash
cd backend
npm run db:ping
npm run db:migrate
npm run db:ml:ping
npm run db:ml:migrate
npm run db:status
npm run db:ml:status
```

## Product notes

- NFL offensive players only (QB / RB / WR / TE) — seeded from nflverse `roster_2026.csv` (~455 ACT)
- Fake currency only
- No live NFL stats feed yet — dividends are admin/script triggered
- Local / shared **bot traders** simulate market flow (weighted toward higher-priced stars, with mild mean reversion)
