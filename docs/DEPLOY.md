# Deploy shared market (EC2 + bots) + Vercel web
#
# Architecture: t3.micro runs Dockerized Express + bots; store.json on disk;
# Cloudflare Tunnel provides HTTPS for Vercel (no ALB). Target ~$5–10/mo.
# Set an $8 AWS Budget email when deploying.

## Prerequisites

- AWS CLI configured (`aws sts get-caller-identity` works)
- Node 20+ locally; Docker Desktop (CDK builds/pushes a **linux/amd64** Node 24 image — required for `t3.micro` + `node:sqlite`)
- Cloudflare account (free) for a named Tunnel
- Vercel account (Hobby / free)

## 1. AWS Budget email + optional tunnel token

```bash
export JOCK_BUDGET_EMAIL="you@example.com"
# Optional at deploy time — or install cloudflared later via SSM:
# export CLOUDFLARE_TUNNEL_TOKEN="eyJ..."
```

Create a Tunnel in Cloudflare Zero Trust → Networks → Tunnels:

1. Create tunnel → copy the **install token**
2. Public hostname → Service URL `http://127.0.0.1:4000` (HTTP)
3. Save the public HTTPS hostname (e.g. `https://jock-api.example.com`)

## 2. Deploy the market stack

```bash
cd infra
npm install
npx cdk bootstrap   # once per account/region
npx cdk deploy JockExchangeMarketStack \
  -c budgetEmail="$JOCK_BUDGET_EMAIL" \
  -c cloudflareTunnelToken="$CLOUDFLARE_TUNNEL_TOKEN"
```

Or: `JOCK_BUDGET_EMAIL=... CLOUDFLARE_TUNNEL_TOKEN=... npm run deploy:market`

Outputs include `InstanceId` and `SsmConnectHint`.

First boot installs Docker, pulls the image, seeds the roster if `store.json` is empty, starts bots. Wait 3–5 minutes after create.

### Health check (on the instance)

```bash
aws ssm start-session --target <InstanceId>
# then:
curl -s http://127.0.0.1:4000/health
docker logs jock-api --tail 50
```

## 3. Cloudflare Tunnel (if you skipped the token)

On the instance (SSM session):

```bash
curl -fsSL -o /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /usr/local/bin/cloudflared
sudo cloudflared service install <YOUR_TUNNEL_TOKEN>
sudo systemctl enable --now cloudflared
```

Point the tunnel’s public hostname at `http://127.0.0.1:4000`.

## 4. Restrict CORS (optional but recommended)

After you know the Vercel URL, recreate/update the container with:

```bash
docker rm -f jock-api
# re-run the same docker run as user-data, plus:
#   -e CORS_ORIGINS=https://your-app.vercel.app
```

Or set origins in a small wrapper script on the box. Empty/unset CORS allows any origin (fine for early alpha).

## 5. Deploy web on Vercel

1. Import the GitHub repo in Vercel (push this branch first if `vercel.json` / mobile app aren’t on GitHub yet)
2. **Root Directory:** `apps/mobile`
3. Framework: Other (uses [apps/mobile/vercel.json](../apps/mobile/vercel.json))
4. Environment variable (Production + Preview):
   - `EXPO_PUBLIC_API_URL` = `https://jockex.dev` (no trailing slash)
5. Deploy → you get `https://<project>.vercel.app`

Local check before Vercel:

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=https://jockex.dev npm run export:web
npx serve dist
```

## 6. Smoke test

1. Open the Vercel URL
2. Sign up → Search → open a player → Buy
3. Confirm % chips / chart move (bots)
4. Carlos uses the **same** Vercel URL (no local backend)

Expo Go against prod: set `EXPO_PUBLIC_API_URL` the same way when starting Metro, or use a `.env` in `apps/mobile`.

## Costs / pause / destroy

| Action | Command / note |
|--------|----------------|
| Stop billing for compute | AWS Console → EC2 → Stop instance (data on EBS kept) |
| Tear down stack | `cd infra && npm run destroy:market` |
| Budget | Created at **$8/mo** when `budgetEmail` is set — confirm the SNS/email subscription |

**Avoid:** NAT Gateways, Application Load Balancers, leaving unused volumes/AMIs.

The legacy `JockExchangeStack` (Lambda/Dynamo/Cognito) is **not** required for this deploy. Do not deploy it unless you intentionally want that skeleton (extra cost).

## Updating the API image after code changes

CDK publishes a new **linux/amd64** image, but EC2 user-data only runs on first boot — pull + recreate the container afterward:

```bash
cd infra
JOCK_BUDGET_EMAIL=you@example.com npx cdk deploy JockExchangeMarketStack
# Print pull/restart commands:
INSTANCE_ID=<InstanceId> IMAGE_URI=<ApiImageUri> ./scripts/redeploy-api.sh
# Or run them via: aws ssm start-session --target <InstanceId>
```

Always pass `JOCK_BUDGET_EMAIL` on deploy so the $8 budget is not dropped from the stack.
