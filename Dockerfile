# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig*.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HTTP_HOST=0.0.0.0 \
    PORT=4173 \
    GEOLISTS_MAPS_DIR=/app/data/maps
WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server/map-server.mjs server/http-utils.mjs server/map-installer.mjs server/map-update-utils.mjs server/server-config.mjs ./server/
COPY --chown=node:node config ./config
RUN mkdir -p /app/data/maps && chown -R node:node /app/data

USER node
EXPOSE 4173
VOLUME ["/app/data/maps"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/map-server.mjs"]
