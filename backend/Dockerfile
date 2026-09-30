# Jock Exchange API + in-process market bots
FROM node:24-bookworm-slim

WORKDIR /app

# Production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source (includes src/data/roster.json + Postgres migrations) and db scripts
COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
  && mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Optional data volume. The API reads DATABASE_URL, not a file in this directory.
VOLUME ["/app/data"]

ENTRYPOINT ["/docker-entrypoint.sh"]
