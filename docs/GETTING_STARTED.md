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

For a complete synthetic shift, open **Production shift → Commission machine**
and follow the [production workflow](PRODUCTION_WORKFLOW.md). The simulator includes
running/idle/fault states and total/good/reject counters. These fixtures exercise
the calculations; they do not qualify a physical machine.

## Container deployment

For a fresh installation with generated credentials, isolated preview and complete
backup/restore tooling, use the [operations guide](OPERATIONS.md). The manual
Compose setup below remains available for development and existing installations.

Create a private `.env` in the repository root containing `DB_PASSWORD`,
`DB_ADMIN_PASSWORD`, `SESSION_SECRET`, `COOKIE_SECRET`, `SEED_ADMIN_PASSWORD` and
`CLIENT_URL=http://localhost:3001`. Generate unique secrets; the seed password
must be at least 12 characters. A new database volume gets a separate `postgres`
superuser (`DB_ADMIN_PASSWORD`) and an application role `dashboard` that only owns
its database. Volumes created before this change keep their original roles; restore
a backup into a fresh installation to adopt the reduced role. Set `OPCUA_IP` and `OPCUA_PORT` for an owned test
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

The image uses Node 24 on Wolfi and renders PDFs directly, running as user 1000.
Rebuild with `docker compose build --pull` to refresh base packages. Existing
database and volume paths are retained. Follow the [reporting migration guide](REPORTING.md)
for upgrade, rollback, SMTP and report settings. Review the exact-image
[security evidence](DEPENDENCY_REVIEW.md) before deployment.

### Run the published image

Version tags publish `ghcr.io/sparkz400/performance_dashboard` for `linux/amd64`
and `linux/arm64` (for example 64-bit Raspberry Pi OS; no specific board is
qualified). Each architecture passes the runtime smoke test on a native runner
before publishing. Check which workflow and commit built an image:

```sh
gh attestation verify oci://ghcr.io/sparkz400/performance_dashboard:0.1.0 --repo Sparkz400/performance_dashboard
```

To use it with the Compose setup above, add
`APP_IMAGE=ghcr.io/sparkz400/performance_dashboard:0.1.0` to `.env` and run
`docker compose pull app` instead of `docker compose build`. Provenance identifies
the build; it does not replace the signed offline package sites verify with the
publisher key ([releasing](RELEASING.md)).

For nonlocal deployments, read [SECURITY.md](../SECURITY.md) and validate HTTPS,
proxy trust, credentials, OPC UA certificate trust, backup restoration and access
controls in your environment before exposing the service.

## Daily work and access

After commissioning, use **Settings → People & Access** to create operators,
supervisors or read-only viewers and grant machines/sites. Configure each dashboard's
asset list. New accounts have no implicit machine access. Existing viewers remain
read-only after upgrade; assign operator explicitly where needed. **Daily operations**
contains planning, maintenance, energy and history. Select English/Deutsch in the
sidebar or login screen. See [daily operations](DAILY_OPERATIONS.md).
