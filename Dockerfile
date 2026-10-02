# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
# Prisma selects its native engine when generating the client. Install the
# same OpenSSL major version in the builder and runtime before generation.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --fund=false

FROM dependencies AS builder
COPY tsconfig.json next.config.ts postcss.config.mjs ./
COPY public ./public
COPY src ./src
COPY prisma ./prisma
COPY scripts/sync-prisma-schemas.mjs ./scripts/sync-prisma-schemas.mjs
COPY scripts/public-demo-network.cjs ./scripts/public-demo-network.cjs
# A schema selection URL, never a credential to an existing database.
# Generation and compilation do not migrate or seed the runtime database.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ARG NEXT_PUBLIC_DEMO_READ_ONLY=false
ENV NEXT_PUBLIC_DEMO_READ_ONLY=$NEXT_PUBLIC_DEMO_READ_ONLY
ARG DEMO_ACCESS_MODE=
ENV DEMO_ACCESS_MODE=$DEMO_ACCESS_MODE
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts --no-audit --fund=false

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends chromium tini openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/src ./src
COPY --chown=node:node scripts ./scripts
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/tsconfig.json /app/next.config.ts ./
RUN mkdir -p data .next/cache && chown -R node:node data .next/cache
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "scripts/start-server.mjs"]
