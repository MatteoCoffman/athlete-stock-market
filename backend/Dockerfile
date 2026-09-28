# Jock Exchange API + in-process market bots
# node:sqlite requires Node 22+ (use 24 to match local / no experimental flag)
FROM node:24-bookworm-slim

WORKDIR /app

# Production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source (includes src/data/roster.json + db migrations)
COPY src ./src
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
  && mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Persist store.json + jock.db here (bind-mount on EC2)
VOLUME ["/app/data"]

ENTRYPOINT ["/docker-entrypoint.sh"]
