# Update the EC2 market

Use this after a **backend** change (`backend/`). A website-only change in `apps/mobile` updates through Vercel when you push. It does not need these steps.

The live market is one container, `jock-api`, on instance `i-0add4035d38bd6052` in `us-east-1`. Replacing that instance wipes the database. These steps only swap the container.

Do this from your Mac, in the repo, with Docker Desktop running. CDK builds an unused Lambda bundle and will fail if Docker is off.

## 1. Publish a new image

```bash
cd infra
JOCK_BUDGET_EMAIL=matteo.coffman@gmail.com npx cdk deploy JockExchangeMarketStack
```

Always pass `JOCK_BUDGET_EMAIL`. Without it, the $8 budget is dropped from the stack.

When it finishes, copy `ApiImageUri` from the outputs. The instance id should still be `i-0add4035d38bd6052`.

## 2. Open the server

From the repo root:

```bash
aws ssm start-session --target i-0add4035d38bd6052 --region us-east-1
```

At the `sh-5.2$` prompt, type:

```bash
sudo -i
```

The prompt should change to `root@…#`. Docker commands fail with "permission denied" if you skip this.

## 3. Restart the container

Paste this on the server. Replace `IMAGE_URI` with the `ApiImageUri` from step 1, and `YOUR_NEWS_KEY` with the Currents key. Do not commit the key.

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 539361143435.dkr.ecr.us-east-1.amazonaws.com
docker pull IMAGE_URI
JWT_SECRET=$(aws secretsmanager get-secret-value --region us-east-1 --secret-id jock-exchange/jwt-secret --query SecretString --output text)
ADMIN_TOKEN=$(aws ssm get-parameter --region us-east-1 --name /jock-exchange/admin-token --query Parameter.Value --output text)
docker rm -f jock-api || true
docker run -d --name jock-api --restart unless-stopped \
  -p 127.0.0.1:4000:4000 \
  -v /var/lib/jock-exchange/data:/app/data \
  -e "JWT_SECRET=$JWT_SECRET" \
  -e "ADMIN_TOKEN=$ADMIN_TOKEN" \
  -e CURRENTS_API_KEY=YOUR_NEWS_KEY \
  -e PORT=4000 -e BOTS_ENABLED=1 \
  IMAGE_URI
```

`scripts/redeploy-api.sh` prints a similar block. It leaves out `sudo -i` and `CURRENTS_API_KEY`. Without the news key, Recent News 404s.

The pull can sit quietly for a minute. `docker run` prints a long container id when the new container has started.

## 4. Check that it is up

The first health check can be too early. On a fresh image the app copies data into `jock.db` before it listens. Wait a few seconds, then:

```bash
curl -sf http://127.0.0.1:4000/health && docker ps --filter name=jock-api
```

It worked when that prints `{"ok":true,"service":"jock-exchange-api"}` and a `jock-api` row that says `Up`, with an image tag matching the one you pulled.

If curl prints nothing:

```bash
docker logs --tail 80 jock-api
```

Type `exit` twice to leave the server session. Only one person should restart the container at a time.
