# Getting started

Use Node.js 24 and Docker with Compose. Clone
`https://github.com/Sparkz400/performance_dashboard.git` and use branch `main`.
All npm commands below run from the repository root.

## Local simulator setup

1. Run `npm ci` and `npm run build:server`.
2. Copy `server/.env.example` to `server/.env`. Replace the cookie/session secrets
   and admin seed password with unique values; keep the file private. The local
   database credentials in the example are only for the loopback demo container.
3. Run `docker compose -f compose.local.yml up -d --wait db`.
4. Run `npm run db:migrate -w server` and `npm run db:seed -w server`.
5. Run `npm start`, and run `npm run simulate` in another terminal.
6. Open http://localhost:5173. Login is `admin` with `SEED_ADMIN_PASSWORD`.

Windows users can use `./scripts/start-local.ps1` after steps 1–2. It performs
the remaining startup steps and records process IDs/logs in `.local/`. Its `-Stop`
switch stops only the recorded project Node processes. The database remains
available; `docker compose -f compose.local.yml stop` stops it without deleting data.

The development services use ports 5173 (UI), 3001 (API), 4841 (simulator) and
55432 (PostgreSQL). Do not stop someone else's process to free these ports.

## First machine and dashboard

Open Machines and edit the seeded Local OPC-UA Simulator. Use host `localhost`,
port `4841`, resource path `/UA/MyLittleServer` and activate it. The bundled
simulator permits security mode None for this local example only.

Open node mappings, browse the simulator and map `AirConsumption`,
`PowerConsumption`, `OperationMode`, `Running` and `StatusText` using their
matching scalar types. Save the mappings and connect. Add monitoring widgets to
the dashboard. These readings are synthetic, not real production measurements.

For OEE, use the [compatibility guide](COMPATIBILITY.md). The simple simulator
does not supply production counters, so it cannot establish a valid OEE figure.

## Container deployment

Create a private `.env` in the repository root containing `DB_PASSWORD`,
`SESSION_SECRET`, `COOKIE_SECRET`, `SEED_ADMIN_PASSWORD` and
`CLIENT_URL=http://localhost:3001`. Generate unique secrets; the seed password
must be at least 12 characters. Set `OPCUA_IP` and `OPCUA_PORT` for an owned test
endpoint; `host.docker.internal:4841` addresses the host simulator on Docker Desktop.

```sh
docker compose build
docker compose up -d --wait db
docker compose run --rm app node dist/src/database/migrate.js
docker compose run --rm app node dist/src/database/seed.js
docker compose up -d app
```

Open http://localhost:3001. The container serves the built frontend and API from
one origin. Migrations run before app startup. PostgreSQL, measurement spool,
certificates and reports use persistent volumes. Never use `down -v` unless you
intend to delete those data volumes and have verified backups.

For nonlocal deployments, read [SECURITY.md](../SECURITY.md) and validate HTTPS,
proxy trust, credentials, OPC UA certificate trust, backup restoration and access
controls in your environment before exposing the service.
