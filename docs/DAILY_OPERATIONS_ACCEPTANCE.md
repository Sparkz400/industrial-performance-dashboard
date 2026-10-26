# Daily workflow acceptance

Scope: TODO **DF01–DF04, DF06, DF07**, implemented independently of TIA MCP.
Local evidence was collected on 2026-10-26 with Node 24.22.1, PostgreSQL 16,
Chromium and owned fixtures. Use the CI checks on the exact revision being deployed.
The behavioral contract and upgrade notes are in [daily operations](DAILY_OPERATIONS.md).

| Check | Evidence |
| --- | --- |
| Both builds and client type check | `npm run build`; `npx tsc --noEmit -p client/tsconfig.json` |
| Unit and coverage suites | 157 server tests, 68 client tests; `npm run test:coverage` |
| Roles and asset/site isolation | `node scripts/test-access.mjs`: five roles, two sites, REST, tRPC, CSV, live rooms, negative routes, counts, grant revocation, browser grant editing and account cache isolation |
| Retention and sustained history | `node scripts/test-history.mjs`: 200,000-row raw export, explicit aggregation, concurrent reads/ingestion, policy revision rejection, 5,000-row deletion batches, late historical arrivals, quality summaries |
| Planning, maintenance, energy | `node scripts/test-daily-workflows.mjs`: calendars/holidays, replay-safe publication, run overlap/stale edits, non-running breaks, immutable canonical snapshots, metered energy, independent reconciliation, required checks and retry-safe service history |
| Browser daily work | Set `DAILY_BROWSER=1` for the preceding script: saved/published calendar, product run/revision download, German inspection without losing a draft, energy setup, 390-pixel layout, coarse-pointer targets, focus and retention confirmation |
| Existing factory workflow | `node scripts/test-production.mjs`: protected OPC UA, commissioning, reports/SMTP, operator/wallboard, read-only gateway, replay and deliberate storage failure |
| Existing browser regression | 12 Playwright tests against a disposable database/application; login, dashboard persistence/widget gallery, machines, disabled modules, trend metadata, CSRF and public certificate |
| Schema and packaging | Drizzle reports no ungenerated changes; Storybook builds. Container runtime/smoke checks and both OS validation jobs also run in CI |

The fixture helpers create random `pd_daily_*` databases and private temporary
directories, and close/remove them on completion. They require the owned PostgreSQL
on localhost:55432. They never seed/reset the user's running database. Browser evidence
and the history receipt are saved to ignored `.local/daily-evidence/`; CI uploads only
that explicit evidence directory, not credentials, database files or other local state.

## Measured bounds

In the final minute-long local history run, 338 history reads and 338 ingested rows
ran while exporting 200,000 rows. Total elapsed time was 63.167 seconds, with query
p95 **230 ms**. The summary retained **180,000 good samples** and kept bad quality
explicit. Other verification jobs were running on the same host; this is a synthetic
workload, not PLC throughput or a day-long factory soak.

The previously built `main` dashboard page chunk was **3,865,975 bytes**. Moving the
widget library to its open action reduced the page chunk to approximately **54 KB**;
the roughly **3.8 MB** library still downloads when opened. The entry chunk increased
from approximately **834 KB** to **901 KB** as the new UI/locale support was added.
These are uncompressed generated asset sizes, not total network load or a timing claim.
The comparison receipt lives alongside browser evidence.

## Remaining acceptance boundaries

- Physical S7-1500 CPU/firmware/licence/security settings, meter calibration, signal
  identities, sampling rates and independent full-shift totals need machine-owner checks.
- Tenant isolation, multi-instance coordination and long-running factory capacity are
  not established by these tests. Site/asset access applies within one installation.
- Keyboard/mobile/touch flows were exercised; complete screen-reader certification,
  glove use and viewing-distance/operator acceptance remain separate.
- Core workflows are bilingual. Specialist/experimental screens and server diagnostics
  may remain English. Raw-history retention is opt-in and protects report/service evidence.
- Unit coverage remains incomplete across the larger legacy application; passing this
  suite does not constitute exhaustive security or statistical qualification.
