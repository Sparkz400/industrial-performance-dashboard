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
[Compatibility](docs/COMPATIBILITY.md) · [Roadmap](docs/ROADMAP.md) ·
[TODO](TODO.md) · [Research](docs/RESEARCH.md) · [Contributing](CONTRIBUTING.md) ·
[Discussions](https://github.com/Sparkz400/performance_dashboard/discussions)

The [acceptance execution record](docs/ACCEPTANCE_EXECUTION.md) lists every remaining
pilot gate and the evidence needed to close it. Release candidates remain unsigned
until publisher key custody is established.

## What it does

- Browse OPC UA nodes and configure per-machine tag mappings.
- Connect with protected machine identities, explicit certificate trust and redacted commissioning diagnostics.
- Display live readings and historical charts in configurable dashboards.
- Calculate OEE from explicitly mapped machine states and production counters.
- Preserve scalar values, source timestamps and quality information in history.
- Retain namespace-aware signal identity and receive time for new measurements.
- Show bounded trends over the full selected interval with quality gaps and resolution.
- Buffer measurements on local disk and replay them after database interruptions.
- Commission namespace-aware machine profiles and create a machine dashboard.
- Track running/idle/fault/unknown intervals, classify stops and reconcile a shift report.
- Persist alarm transitions and signed webhook retries with authenticated acknowledgment.
- Enforce role and machine/site access and disconnect revoked or expired sessions.

Additional experimental screens include statistical process control, digital
twins, recipes and compliance records. Their presence is not a support or
certification claim; see [current status](docs/STATUS.md).

The interface uses locally bundled Figtree fonts, including charts and wallboards,
with tabular numerals for stable measurements and monospace technical identifiers.
Fonts require no internet access; see [font source and license](client/public/fonts/figtree/README.md).

Light and dark modes share a restrained industrial theme: grey/charcoal surfaces,
raised controls, recessed charts and orange accents. Status indicators retain
their distinct colors and labels. Keyboard focus and reduced-motion preferences
are supported; the style does not change measurement or quality semantics.

The shift overview shows scoped machine observations and shift timelines. Custom
Dashboards retain their saved layouts. Phones provide full administration through
bottom navigation and the More menu, with page-sized machine editors, grouped
Operations, Settings selectors and labelled administration rows. See the
[interface guide](DESIGN.md) for navigation, state semantics and validation scope.


Sites can run their own installation and send committed history to a central one, which
shows each site's availability and data coverage ([edge sites](docs/MULTI_SITE.md)).
Single sign-on through OIDC and read-only service tokens are available
([identity](docs/IDENTITY.md)).
The AI assistant and external AI-provider integration have been removed.
Administrators can share selected trend widgets through expiring, revocable read-only
links; legacy alarm email/chat/SMS channels are disabled.
See the [production workflow](docs/PRODUCTION_WORKFLOW.md),
[P0 acceptance evidence](docs/P0_ACCEPTANCE.md), the per-screen
[acceptance matrix](docs/ACCEPTANCE_MATRIX.md), the
[security and deployment boundaries](docs/SECURITY_BOUNDARIES.md), the
[data ownership and retention inventory](docs/DATA_OWNERSHIP.md) and the WCAG 2.2
[accessibility checklist](docs/ACCESSIBILITY.md).
The first nominated pilot family is [Siemens SIMATIC S7-1500](docs/S7_1500_PILOT.md);
software acceptance uses owned simulators, with physical CPU qualification still open.
For isolated installation, complete backups, restore checks and upgrades, see the
[operations guide](docs/OPERATIONS.md); signed releases follow [releasing](docs/RELEASING.md).
Sanitized [examples](examples/README.md) cover a gateway, a production profile, a
dashboard and a report template.
The [operator workflow](docs/OPERATOR_WORKFLOW.md) covers handover actions, reviewed
manual counts and the supervisor wallboard with a dedicated read-only account.
[Unattended operation](docs/UNATTENDED_OPERATION.md) covers durable scheduled reports,
email retry status, alarm holds/hysteresis, collector/data-health incidents, spool
capacity and quarantine, and the single-collector lock with fenced leases
([high availability](docs/HIGH_AVAILABILITY.md)).
Integrations use the bounded [integration API contract](docs/INTEGRATION_API.md):
four read endpoints, a durable webhook outbox and a version policy.
The [legacy gateway recipe](docs/LEGACY_GATEWAY.md) includes a read-only Modbus TCP
adapter, owned simulator and reusable production profile; serial RTU devices are read
through an RTU-to-TCP gateway. Machines that publish JSON can be read through an MQTT
broker over TLS ([MQTT sources](docs/PRODUCTION_WORKFLOW.md#mqtt-sources)), and PLC alarms
can be observed read-only ([PLC alarms](docs/DAILY_OPERATIONS.md#plc-alarms)).
[Incident replay](docs/INCIDENT_REPLAY.md) joins bounded historical signals, alarm
transitions, operator revisions and stop classifications with explicit clock and gap information.
See [factory-pilot acceptance](docs/FACTORY_PILOT_ACCEPTANCE.md) for tested software
milestones and the separate physical-machine gates.

The [daily operations guide](docs/DAILY_OPERATIONS.md) covers machine/site access,
recurring shift calendars, product runs and frozen reports, maintenance inspections,
metered energy and reviewed history retention. Core workflows support English/German.
See [daily workflow acceptance](docs/DAILY_OPERATIONS_ACCEPTANCE.md) for software evidence.

[Quality and line operations](docs/QUALITY_LINE_OPERATIONS.md) adds frozen batch
recipes, race-free batch records, inspections/rework/lot traceability, reviewed SPC
reference baselines, restart-stable live SPC, a tamper-evident audit chain without
regulatory claims,
line-loss investigations and linked alarm maintenance actions. It also documents
measured disk runway, reviewed retention scheduling, offline image packages and
configurable multi-day synthetic workloads. Advanced screens currently require
an administrator except scoped supervisor line investigations and alarm actions;
multi-day reliability and supported capacity remain unqualified.

[Factory readiness](docs/FACTORY_READINESS.md) extends those supervisor workflows
with attributable, versioned maintenance corrections and English/German screens.
Correction history is preserved without a fixed count ceiling and browsed in pages;
shift calculations merge observed and declared states with a boundary sweep.
Saved shift revisions can be compared with explicit coverage, product-mix and
definition checks; differences are withheld when evidence is not comparable.
Installation endurance serves the compiled frontend and exercises the real collector,
alarms, scheduled reports and signed-in browser sessions with confirmed logout/login
renewal. Bounded browser network logs support failure diagnosis; a short run does not qualify
72-hour operation. Edge cursors wait for open measurement transactions; PLC alarm
events remain in a durable local spool until PostgreSQL confirms storage.

[Data integrity and reviewed operations](docs/DATA_INTEGRITY.md) adds observed-data
widgets, attributable measurement corrections, bounded calculated signals, explicit
offline drafts, reviewed CMMS handoff and versioned energy estimates.

[Factory operations](docs/FACTORY_OPERATIONS.md) adds reviewed setup bundles with
rollback, connection diagnostics, alarm usefulness/replay, local work-order exchange
and a scoped interactive asset view. It includes a repeatable synthetic walkthrough
and signed, versioned offline release candidates with revision-specific evidence; the
next package updates an installation offline after a verified backup.
ERP vendor acceptance, publisher trust and physical qualification remain separate.

## Where it is going

The [roadmap](docs/ROADMAP.md) starts with trustworthy measurements and a useful
one-line pilot, then develops connectivity, production workflows, quality,
maintenance, energy and multi-site operation. The [research assessment](docs/RESEARCH.md)
separates current code from proposed capabilities; the [TODO backlog](TODO.md)
tracks priorities, dependencies and completion criteria. These are plans, not
released features or compatibility promises.

## Try it with synthetic data

After `npm ci` and starting the owned local database with
`docker compose -f compose.local.yml up -d`, run **`npm run demo`**. The local guide
provides a generated login, a known shift and missing-data/quality/reset scenarios.
Data survives restart; `npm run demo:reset` resets only the owned demo database.
See the [interactive demo guide](docs/INTERACTIVE_DEMO.md).

The [machine-profile catalog](profiles/README.md) provides importable mappings,
contribution checks and explicit simulator/reported/physical qualification levels.
On a production shift, **Export reproducible evidence** downloads measurements,
quality, configuration and revision references for [offline OEE reproduction](docs/SHIFT_EVIDENCE.md).
No physical qualification or publisher signature is implied.

## Quick start

Install **Node.js 24**, npm and **Docker Desktop** (or Docker Engine with Compose).
Run commands from the repository root. No physical machine is needed for the demo.

```sh
npm ci
npm run build:server
docker compose -f compose.local.yml up -d --wait db
```

The install applies a guarded OPC UA queue-overflow fix; script-disabled installs
must run it explicitly. See [dependency maintenance](docs/DEPENDENCY_REVIEW.md#opc-ua-overflow-patch).

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
Security checks include the full npm audit, CodeQL and exact-image container reports.
The production image uses Node 24/Wolfi and browser-free PDFs; the full migrated
image scan is clear. See the [dependency and image review](docs/DEPENDENCY_REVIEW.md)
and [reporting compatibility/upgrade guide](docs/REPORTING.md) for evidence and limits.

## License

Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Dependencies retain their
own licenses. OPC UA and vendor names belong to their respective owners.
