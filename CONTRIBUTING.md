# Contributing

Start with the [README](README.md) and [current status](docs/STATUS.md). Open a
discussion before a substantial feature or architecture change. Prefer a small,
complete change with a reproducible example over another unfinished subsystem.

## Setup and validation

Use Node.js 24 and the root `package-lock.json`. Run `npm ci` from the repository
root; client, server and shared types are npm workspaces. Do not create workspace
lockfiles or commit generated builds, credentials, certificates or customer data.
Follow [Getting started](docs/GETTING_STARTED.md) for a fresh database and simulator.

```sh
npm run build
npx tsc --noEmit -p client/tsconfig.json
npm run lint
npm run format:check -w client
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

Browser tests read the local password from `server/.env`, or `E2E_USERNAME` and
`E2E_PASSWORD` from the environment. Use an isolated development database. Tests
must clean up the records they create and fail when an expected UI action is absent.

Add focused regression tests for data interpretation, reconnects, authentication,
authorization and persistence. Check real PostgreSQL writes when changing the
measurement schema. Generate migrations with `npm run db:generate -w server` and
test `npm run db:migrate -w server` against a fresh database. Never replace a
published migration or run destructive schema pushes against someone else's data.

## Pull requests

Target `main`. Explain the problem, resulting behavior, commands run and remaining
limits. Keep source, shared types, tests and affected documentation consistent.
An OPC UA simulator test is not physical-machine qualification. Avoid claiming
universal compatibility, compliance certification or production readiness.

`docs/wiki/` is the source for the GitHub wiki. Update it alongside setup,
architecture or status changes; direct wiki edits are overwritten by publishing.

## Adding a connector

There is no plugin loader. A new data source joins as a **read-only OPC UA server**,
like the built-in [Modbus gateway](docs/LEGACY_GATEWAY.md), and the existing collector
reads it. The one native exception is the read-only MQTT subscriber
([MQTT sources](docs/PRODUCTION_WORKFLOW.md#mqtt-sources)), which writes through the same
durable spool. The server must:

- use a stable namespace URI, so signal identity survives restarts;
- report Good/Bad StatusCodes and never invent values for missing data;
- provide a SourceTimestamp, or document that it is the observation time;
- offer SignAndEncrypt with explicit certificate trust, and refuse writes.

Add fixtures for disconnect, duplicate, bad quality, type change and timestamp cases,
and a [compatibility](docs/COMPATIBILITY.md) entry that keeps simulator evidence
separate from named vendor/model/firmware results. The reasoning, and what would
reopen this decision, are in [research decisions](docs/RESEARCH_DECISIONS.md#i08--evaluate-connector-packaging-for-contributors).

## Small, focused contributions

Pick one subsystem, change it end to end, and attach the evidence listed for it. Open
items in [TODO.md](TODO.md) name their subsystem by prefix (F foundation, C connectivity,
H history, O operations, A alarms, R reports, Q quality, M maintenance, U interface,
D deployment, I integrations, E enterprise, X experiments, P project).

| Subsystem | Where | Evidence to run and quote in the PR |
| --- | --- | --- |
| Collector, spool, OPC UA | `server/src/opc-ua/`, `server/src/queue/` | server unit tests, `test-recovery.mjs`, `test-subscription-limits.mjs`, `test-spool-quarantine.mjs` |
| History and retention | `server/src/routes/historyRoutes.ts`, `historyRetention.ts` | `test-history.mjs`; `benchmark-history.mjs` for query or index changes |
| Alarms and webhooks | `alarmService.ts`, `webhookService.ts` | `test-alarm-replay.mjs`, `test-integration-outbox.mjs`, `test-production.mjs` |
| Reports | `server/src/services/report*` | `test-report-boundaries.mjs`, `test-examples.mjs` |
| Quality, SPC, batches, audit | `spc*`, `batch*`, `compliance*` | `spcLive.test.ts`, `test-spc-live.mjs`, `test-batch-lifecycle.mjs`, `test-compliance-audit.mjs` |
| Line analysis | `lineAnalysis.ts`, `LinePanel.tsx` | `lineAnalysis.test.ts`, `test-line-analysis.mjs` |
| Integration API | `docs/INTEGRATION_API.md` endpoints | `test-api-contract.mjs` (additive changes only) |
| User interface | `client/src/` | client tests, `tsc`, lint, `test-accessibility.mjs` and the browser test of the screen you changed |
| Access control | `server/src/middleware/assetAccess.ts` | `accessMatrix.test.ts` snapshot review, `test-access.mjs` |
| Releases | `scripts/release-*.mjs`, `scripts/offline-package.mjs` | `test-release-package.mjs`, `test-offline-update.mjs PREVIOUS_REVISION` (Docker); see [releasing](docs/RELEASING.md) |

Browser and database scripts create and drop their own database on the local test
container (port 55432) and use owned simulators; never point them at a production
machine or database. Sanitized starting fixtures are in [examples](examples/README.md).

Custom widgets use the sandboxed runtime with versioned manifests, declared permissions
and scoped series delivery. Follow [the widget contract](docs/CUSTOM_WIDGETS.md) and run
`scripts/test-custom-widgets.mjs`; registration alone is not runtime acceptance.

Contributions are under Apache-2.0. Submit only code and data you have permission
to share. Follow the [code of conduct](CODE_OF_CONDUCT.md).
