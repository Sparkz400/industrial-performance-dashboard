# P0 acceptance evidence

First implementation wave, [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40), 2026-10-26. This is a bounded software acceptance
record, not physical-machine or production qualification. The remaining work is
tracked in [TODO](../TODO.md); the original inspection remains in [research](RESEARCH.md).

Local final validation: 120 server tests, 65 client tests and 12 Chromium browser
tests passed. Both production builds, client type checking, formatting and the
three database/telemetry scripts passed. Lint has no errors; warnings remain,
predominantly existing documentation/unused-symbol warnings. The client build
still reports large bundles; performance work is tracked separately.

## Feature boundaries

| Feature / task | Current behavior | Evidence | Remaining boundary |
| --- | --- | --- | --- |
| Measurement identity / H01 | Endpoint, machine, namespace URI, identifier, mapping revision and optional engineering unit travel with raw type/value, quality, source/receive times and durable event identity. Namespace-index changes do not change signal identity when the URI is unchanged. | measurementIdentity and measurementSpool unit tests; test-p0 migration/replay assertions; owned local simulator persisted identity and receive time for numeric, Boolean and string mappings. | Legacy identity/receive time stay null. Missing engineering units stay unknown. Aliases still select historical series; source remapping must be reviewed. No physical endpoint qualification. |
| SPC isolation / F02 | Every profile/machine/tag has its own rolling window. Baselines and charts require the profile's machine and exclude unknown/bad values from statistics. Profile updates reset its window. | spcIsolation unit test and real PostgreSQL baseline/second-machine fixture in test-p0. | SPC statistics and baseline acceptance remain experimental under Q01/Q02. |
| Trend completeness / H02 | Dense windows aggregate across the entire interval into at most 2,000 points. Responses disclose resolution, counts, legacy provenance and possible concurrent-query truncation. UI consumes the API envelope and uses real time spacing. | 5,001-sample, same-key machine, long-window and explicit-bucket database assertions; client zero/null conversion test; Chromium trend fixture. | Samples do not prove continuity. A concurrent arrival between summary and raw reads may produce an explicitly flagged truncated result. |
| Quality propagation / H03, partial | Bad/mixed and empty buckets are gaps; raw zero remains zero. Reports use whole-query statistics and disclose counts/resolution. Isolated samples remain visible; legend choices survive data refresh. | Database and browser fixtures above. | KPI/tooltip/source-time consistency across every widget is still open. Exports still need H04's bounded, quality-aware contract. |
| Edge / F04 | Transfer and ingest mutations return 501. Background transfers are disabled. Read-only settings distinguish retained pending records from previously marked transfers; canonical central history is unavailable. Existing queue data is retained. | experimentalBoundaries unit test; real API/browser Edge Status flow. | H08 must implement authenticated durable central ingestion before re-enabling transfers. This does not disable the separate local acquisition spool. |
| AI / F05 | Suggestions only; no database query execution. API marks provider/evidence/queryExecuted, discards generated chart data, fails clearly without configuration and bounds provider calls. UI discloses Anthropic before sending. | Mocked-provider and missing-key unit tests; Chromium disclosure flow (no external request). | No live paid/provider request was made. Grounded, authorized data questions remain X01. |
| Harness / F10, partial | Database mocks are at module scope. App bootstrap has its own beforeAll budget; HTTP assertions keep their normal timeout. | Parallel client/server coverage run: 65 client tests, 120 server tests; no nested-mock warning or first-route timeout. | Full feature-level negative authorization, durability failure injection and alarm acceptance are still required. |
| Dependencies / F09, partial | Root workspace lock; matched Vitest/coverage v4; aligned OpenTelemetry API/SDK/exporters; updated scheduler type import. | Clean npm ci, npm ls without invalid peers, builds/type checks, unit/integration suites, real loopback span export, database/certificate tests, browser flows. | Exact-image security review and the broader access-boundary audit remain open. See dependency disposition record. |

## Reproduce

Use Node.js 24 and the root lockfile. Configure the owned PostgreSQL service on
localhost:55432 using the getting-started instructions.

```sh
npm ci
npm run build
npx tsc --noEmit -p client/tsconfig.json
npm run lint
npm run format:check -w client
npm run test:coverage
node scripts/test-p0.mjs
node scripts/test-measurements.mjs
node scripts/test-tracing.mjs
npx playwright install chromium
npm run test:e2e
```

test-p0 creates a uniquely named temporary database, upgrades a pre-identity
schema containing a legacy measurement, verifies repeat migrations and replay,
then removes only that owned database and spool. test-measurements creates and
removes its own inactive machine and temporary certificates. test-tracing sends
one synthetic span only to its own ephemeral loopback collector.

The browser suite includes real login, CSRF, machine settings, dashboard
persistence, public-certificate and disabled-edge flows. Trend rendering uses a
clearly synthetic API fixture, with actual SQL behavior tested separately. AI
tests never contact Anthropic. No browser fixture is evidence from a real machine.

The hosted browser run additionally exposed overlapping Add Widget/AI buttons
and per-handshake session middleware creation. The buttons now occupy separate
positions; one middleware instance serves each socket server. A real loopback
socket test rejects 20 unsigned handshakes without growing session-store listeners,
then accepts a correctly signed session. Session expiry/revocation audits remain F07/F08.

## Still open

F01 needs fixtures for the unwired alarm alternatives; F03/A01 need one complete
alarm-to-delivery path. F06 needs process-kill/disk-full/replay interruption tests.
F07/F08 need complete authorization/session/share audits. C01/C02 and D01-D03
retain endpoint identity/trust, deployment, backup and upgrade acceptance work.
Passing this wave does not close those tasks or qualify experimental screens.
