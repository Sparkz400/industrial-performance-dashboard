# Performance Dashboard

![Performance Dashboard — Connect. Measure. Understand.](docs/assets/banner.svg)

[![CI](https://github.com/Sparkz400/performance_dashboard/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Sparkz400/performance_dashboard/actions/workflows/ci.yml)
[![Security](https://github.com/Sparkz400/performance_dashboard/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/Sparkz400/performance_dashboard/actions/workflows/security.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

An industrial monitoring dashboard for exploring machine data, production trends,
alarms and overall equipment effectiveness (OEE). Connect OPC UA machines, map
their signals, and build a shared view of a production line.

> **Status:** development software for evaluation with owned simulators and test
> equipment. Local and automated tests do not establish production reliability,
> machine compatibility, regulatory compliance or safety-system suitability.
> See [status and limitations](docs/STATUS.md). This is an independent project.

[Getting started](docs/GETTING_STARTED.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Compatibility](docs/COMPATIBILITY.md) · [Contributing](CONTRIBUTING.md) ·
[Discussions](https://github.com/Sparkz400/performance_dashboard/discussions)

## What it does

- Browse OPC UA nodes and configure per-machine tag mappings.
- Display live readings and historical charts in configurable dashboards.
- Calculate OEE from explicitly mapped machine states and production counters.
- Preserve scalar values, source timestamps and quality information in history.
- Buffer measurements on local disk and replay them after database interruptions.
- Provide alerts, report scheduling and administration with authenticated sessions.

Additional experimental screens include statistical process control, digital
twins, recipes and compliance records. Their presence is not a support or
certification claim; see [current status](docs/STATUS.md).

## Quick start

Install **Node.js 24**, npm and **Docker Desktop** (or Docker Engine with Compose).
Run commands from the repository root. No physical machine is needed for the demo.

```sh
npm ci
npm run build:server
docker compose -f compose.local.yml up -d --wait db
```

Copy `server/.env.example` to `server/.env`. Set unique `COOKIE_SECRET`,
`SESSION_SECRET` and `SEED_ADMIN_PASSWORD` values; the admin password must contain
at least 12 characters. Keep this file private.

```sh
npm run db:migrate -w server
npm run db:seed -w server
npm start
```

In another terminal, run `npm run simulate`. Open **http://localhost:5173** and
sign in as `admin` with your `SEED_ADMIN_PASSWORD`. The local API uses port **3001**,
the simulator **4841**, and the isolated PostgreSQL database **55432**.

On Windows, after configuring `.env`, `./scripts/start-local.ps1` starts the
database, simulator, server and browser development server in the background.
Use `./scripts/start-local.ps1 -Stop` to stop its Node processes. Logs are in
`.local/`; the database and measurement spool are preserved.

Follow [Getting started](docs/GETTING_STARTED.md) to activate the simulator,
map signals and create a dashboard, or run the container deployment.

## Development checks

```sh
npm run build
npm run lint
npm run format:check -w client
npm run test:coverage
npm run test:e2e
```

Browser tests need the local database, seeded credentials and Chromium. See
[Contributing](CONTRIBUTING.md) for the full commands and CI boundaries.

## License

Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Dependencies retain their
own licenses. OPC UA and vendor names belong to their respective owners.
