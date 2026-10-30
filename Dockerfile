FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY scripts/patch-opcua.mjs scripts/patch-opcua.mjs
RUN npm ci --ignore-scripts && node scripts/patch-opcua.mjs
COPY shared/ shared/
COPY client/ client/
COPY server/ server/
RUN npm run build

FROM node:24-trixie-slim AS dependencies
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY scripts/patch-opcua.mjs scripts/patch-opcua.mjs
RUN npm ci --omit=dev --workspace=server --workspace=shared --ignore-scripts && node scripts/patch-opcua.mjs

FROM cgr.dev/chainguard/wolfi-base:latest@sha256:360896efb0753a5701c48f860e17130c205eae5a264797aa3e7ea126ee2923a7 AS production
ARG SOURCE_REVISION=unversioned
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
WORKDIR /app
# An edge reports this revision to its central installation (E04 staged upgrades).
ENV NODE_ENV=production SOURCE_REVISION=$SOURCE_REVISION
RUN apk upgrade --no-cache && apk add --no-cache nodejs-24 ca-certificates tzdata \
    && addgroup -g 1000 node && adduser -D -u 1000 -G node node
COPY --from=dependencies /app/node_modules node_modules
COPY --from=dependencies /app/package.json package.json
COPY --from=dependencies /app/server server
COPY --from=dependencies /app/shared shared
COPY --from=build --chown=node:node /app/shared/dist shared/dist
COPY --from=build --chown=node:node /app/server/dist server/dist
COPY --from=build --chown=node:node /app/server/drizzle server/drizzle
COPY --from=build --chown=node:node /app/client/dist server/public
COPY --chown=node:node scripts/test-runtime.mjs scripts/test-recovery.mjs scripts/test-opcua-overflow.mjs scripts/
RUN mkdir -p server/data server/certificates server/logs server/reports && chown -R node:node server
WORKDIR /app/server
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/src/database/migrate.js && exec node dist/app.js"]
