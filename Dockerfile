FROM node:24-trixie-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --ignore-scripts
COPY shared/ shared/
COPY client/ client/
COPY server/ server/
RUN npm run build

FROM node:24-trixie-slim AS production
WORKDIR /app
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends chromium ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=server --workspace=shared --ignore-scripts \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build --chown=node:node /app/shared/dist shared/dist
COPY --from=build --chown=node:node /app/server/dist server/dist
COPY --from=build --chown=node:node /app/server/drizzle server/drizzle
COPY --from=build --chown=node:node /app/client/dist server/public
COPY --chown=node:node scripts/test-runtime.mjs scripts/test-runtime.mjs
RUN mkdir -p server/data server/certificates server/logs server/reports && chown -R node:node server
WORKDIR /app/server
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/src/database/migrate.js && exec node dist/app.js"]
