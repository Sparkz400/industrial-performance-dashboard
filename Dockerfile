# Stage 1: Build client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Install production server dependencies
FROM node:20-alpine AS server-production-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Stage 4: Production
FROM node:20-alpine AS production
WORKDIR /app/server

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --chown=appuser:appgroup --from=server-production-deps /app/server/node_modules ./node_modules
COPY --chown=appuser:appgroup --from=server-build /app/server/dist ./dist
COPY --chown=appuser:appgroup --from=server-build /app/server/package.json ./package.json
COPY --chown=appuser:appgroup --from=server-build /app/server/knexfile.js ./knexfile.js
COPY --chown=appuser:appgroup --from=server-build /app/server/migrations ./migrations
COPY --chown=appuser:appgroup --from=server-build /app/server/certificates ./certificates
COPY --chown=appuser:appgroup --from=client-build /app/client/dist ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER appuser

CMD ["node", "dist/app.js"]
