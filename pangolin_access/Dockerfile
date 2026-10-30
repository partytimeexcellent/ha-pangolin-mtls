# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts ./
COPY server ./server
COPY web ./web
RUN npm run build && npm prune --omit=dev

FROM node:24.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG BUILD_VERSION=0.1.0-dev.12
ARG BUILD_ARCH
LABEL io.hass.name="HA Pangolin Access" \
      io.hass.description="Local client certificates and selected Pangolin CA installation" \
      io.hass.type="app" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.arch="${BUILD_ARCH}"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The short startup bootstrap reads Supervisor options, prepares /data/state,
# then drops supplementary groups and switches to UID/GID 1000 before listening.
# Supervisor supplies init (init:true); this image does not include S6.
EXPOSE 8099
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const s=require('node:net').connect(8099,'127.0.0.1');s.setTimeout(2000);s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>process.exit(1))"]
CMD ["node", "dist/server/main.js"]
