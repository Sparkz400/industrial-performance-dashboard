# Feature acceptance matrix

Closes TODO **F01** (screen-by-screen product contract) and **F10** (feature-level
evidence). Recorded 2026-10-29 in [PR #66](https://github.com/Sparkz400/performance_dashboard/pull/66). It lists what each enabled screen
is supported to do and the kind of evidence behind it. A passing CI run never promotes
an experimental module or a new machine family to supported; that needs this table to
change with new evidence.

**States.** *Supported*: enabled for the pilot with happy- and failure-path evidence.
*Experimental*: administrator-only, may change, not qualified. *Disabled*: refused by the
server (410/501/403) with a visible explanation. *Removed*: no code path remains.

**Evidence levels.** **U** unit (Vitest, mocked database); **D** real PostgreSQL in an
isolated `pd_daily_*`/owned database; **B** real Chromium against a disposable app;
**S** owned simulator or OPC UA/Modbus fixture; **P** physical machine. No row has **P**
yet: physical S7-1500 qualification is tracked separately in the
[pilot guide](S7_1500_PILOT.md). All D/B/S scripts listed below run in CI except
where marked *(local)*.

## Screens

| Screen (route) | Who | State | Happy path | Failure path | Levels |
| --- | --- | --- | --- | --- | --- |
| Login (`/login`) | everyone | Supported | `e2e/auth.spec.ts` | missing CSRF: `e2e/security.spec.ts`; unauthenticated routes: `auth.test.ts`, `anonymous.test.ts`; idle expiry, logout and deactivation: `test-production.mjs`, `socketSessions.test.ts` | U D B |
| Dashboards (`/`, `/dashboard/:id`) | granted users; editing admin | Supported for trend, system status, alarm, alert-summary, OEE, operation-mode and uptime widgets | `e2e/dashboard.spec.ts`, `e2e/p0.spec.ts` | foreign dashboards 403, unknown/stale/bad readings stay unknown: `test-access.mjs`, `test-signal-quality.mjs`, [integrity](DATA_INTEGRITY.md#dashboard-readings) | U D B |
| Dashboard widgets: batch monitor, SPC chart, digital twin | admin | Experimental | `batchQuality.test.ts`, `spcReference.test.ts`, `sanitizeSvg.test.ts` | — | U |
| Dashboard widgets: custom widgets | admins register; editors place | Supported (sandboxed runtime) | `test-custom-widgets.mjs` (rendering, series delivery, version, disable, removal in the browser) | hostile widget blocked from page, storage, cookies, API and navigation; undeclared permission and unknown keys refused; CSP frames only active origins; viewer 403 on registration | D B |
| Selected-data links (`/shared/:token`, `/embed/:token`) | anyone with a live link; created by admin | Supported (new in F08) | `test-shares.mjs` | revoked, expired, demoted creator, legacy and guessed links 410; foreign widgets 404; frame-ancestors: `shareService.test.ts` | U D B |
| Production → shift workspace (`/production`) | granted; operators classify | Supported | `test-production.mjs` (incl. rendered and printed open handover actions); admin collector panel with quarantine export/retry: `test-spool-quarantine.mjs` | stop overlap, DST, counter gaps, independent reconciliation mismatch: `shiftCalculation.test.ts`, `test-production.mjs` | U D B S |
| Production → operator handover | granted; operators write | Supported | `test-operator.mjs` *(local)*, `test-offline-operator.mjs`; reviewed declarations in the report: `test-daily-workflows.mjs` | stale edits, duplicate retries, offline expiry; unreviewed declarations ignored, declared counts never verify: `shiftCalculation.test.ts` | U D B |
| Production → incident replay | granted | Supported | `test-incident-replay.mjs` *(local)* | gaps, quality, clock skew: `incidentReplay.test.ts` | U D B |
| Production → manual state and inspections | granted; operators declare and inspect, supervisors review and plan | Supported | `test-limited-data.mjs` (browser commissioning without signals, declaration, labelled report), `test-job-inspections.mjs` (browser inspection) | unreviewed and partial declarations, contradiction and disagreement stay unknown: `shiftCalculation.test.ts`; rework counted once, stale and double corrections refused: `jobInspections.test.ts`, `test-job-inspections.mjs` | U D B |
| Production → commission machine | admin | Supported | `test-secure-machine.mjs` *(local)*, `test-production.mjs`, `test-mapping-suggestions.mjs` (Machinery and proprietary servers, browser) | wrong credentials, untrusted/expired certificate, host mismatch | U D B S |
| Production → commission machine → MQTT sources | admin | Supported (plain MQTT over TLS; no Sparkplug) | `test-mqtt-ingestion.mjs` (owned TLS broker, browser disable) | wildcard, `$` and plain `mqtt://` refused; publish and unmapped topics refused by ACL; duplicate, late and bad readings; redelivery stored once; broker restart; wrong CA and password: `mqttIngestion.test.ts`, `test-mqtt-ingestion.mjs` | U D B |
| Wallboard (`/wallboard`) | wallboard/viewer accounts | Supported | `test-operator.mjs` *(local)* | stale/failed updates become unknown; viewing-distance acceptance open (U05) | D B |
| Daily operations → planning, maintenance, energy, history | granted; supervisors configure | Supported | `test-daily-workflows.mjs` (incl. machine search, remembered machine/tab, revision reasons, reproducibility check), `test-history.mjs`, `test-maintenance-costs.mjs` | DST/holiday edge cases, stale plans, retention preview expiry, revision without reason refused, regenerated report differences named: `reportRevisionCheck.test.ts`; locale formatting: `i18n.test.ts` | U D B |
| Daily operations → production line, alarm actions, comparisons | supervisor/admin | Supported | `test-quality-line.mjs`, `test-supervisor-workflows.mjs`, `test-period-comparisons.mjs`, `test-line-analysis.mjs` (histogram, Pareto, unresolvable microstops withheld in the browser) | foreign machines 403, stale revisions, incomparable periods | U D B |
| Daily operations → completion forecast, recommendations | supervisor/admin | Advisory | `test-forecasts-recommendations.mjs` (forecast and decisions in the browser) | too few runs withheld, process change resets, tampered and unverified revisions excluded, operator 403, accept without a link or foreign action refused, dismissal without reason refused, decisions final: `completionForecast.test.ts`, `recommendations.test.ts` | U D B |
| Daily operations → diagnostics, alarm usefulness, work orders | supervisor/admin | Supported | `test-operational-diagnostics.mjs`, `test-work-orders.mjs` | expired reviews, duplicate imports, unknown counters | U D B |
| Daily operations → PLC alarms | granted; admin switches observation | Supported (read-only, ConditionRefresh only) | `test-plc-alarms.mjs` (owned server, browser) | refresh replay marked, information-only events kept, RefreshRequired and restart refresh, re-sent EventId stored once, never acknowledged, wallboard 403: `plcAlarms.test.ts`, `test-plc-alarms.mjs` | U D B |
| Daily operations → service links, attachments and improvement actions | granted; operators attach, supervisors judge actions | Supported | `test-maintenance-records.mjs` (browser upload and links), `test-improvement-actions.mjs` (browser action) | spoofed type, oversize, eleventh file, ungranted download 403, superseded or foreign stop refused; unfair mix, timing, unverifiable revision: `improvementEvaluation.test.ts` | U D B |
| Daily operations → changeovers | supervisor/admin; granted roles read | Supported | `test-changeovers.mjs` (browser analysis and standard) | unknown state, run without running and cross-shift transitions unmeasured: `changeoverAnalysis.test.ts`; operator 403 on standards, ungranted 403, window over 31 days 400: `test-changeovers.mjs` | U D B |
| Daily operations → asset overview, calculated signals | granted; supervisors define signals | Supported | `test-asset-overview.mjs`, `test-measurement-corrections.mjs` | bad quality, division by zero, unit mismatch: `derivedSignalExpression.test.ts` | U D B |
| Alerts → history (`/alerts/history`) | granted; operators acknowledge | Supported | `test-production.mjs` (alarm-to-delivery) | foreign acknowledge 403: `test-access.mjs` | U D B S |
| Alerts → rules (`/alerts/rules`) | admin | Supported (machine rules) | `test-unattended-alarms.mjs` *(local)*, `test-alarm-replay.mjs` (versioned replay) | plant rules and channels flagged unsupported; replay before a rule edit uses the old version: `alarmConditions.test.ts`; per-site rule reads: `test-access.mjs` | U D |
| Alerts → notification channels (`/alerts/channels`) | admin | Disabled (legacy channels); signed webhooks are the delivery path | — | UI explains; signed receiver failure/retry: `test-production.mjs`; outbound address checks: `outboundUrlSafety.test.ts` | U D |
| Machines (`/machines`) | admin | Supported | `e2e/machines.spec.ts`; per-endpoint subscription limits: `test-subscription-limits.mjs` | non-admin 403: `accessMatrix.test.ts`; out-of-range limits 400 | U D B |
| Settings → connections, appearance, system info | admin | Supported | `e2e/industrial.spec.ts` | non-admin 403 | U B |
| Settings → backup & restore, setup bundles | admin | Supported | `test-operations.mjs`, `test-configuration-bundles.mjs` | tamper, overwrite, conflicting preview, unknown version | D B |
| Settings → people & access | admin | Supported | `test-access.mjs` | immediate revocation of sessions and sockets | U D B |
| Settings → webhooks | admin | Supported (alarm and CMMS events; alarm email) | `test-integration-outbox.mjs` (browser requeue), `test-alarm-email.mjs` (browser email destination, routing, SMTP outage) | crash between send and acknowledgment, dead letter, viewer 403, requeue of a live delivery 409 | U D B |
| Settings → certificates, audit trail | admin | Supported | `test-secure-machine.mjs` *(local)*, `auditLogService.test.ts` | rejected/expired certificates | U D |
| Settings → Edges (link, enrollment, lifecycle) | admin | Supported (owned installations) | `test-edge-history.mjs` (two edge processes, central behind pinned TLS, browser edge creation), `e2e/p0.spec.ts` | wrong CA, reused code, revoked and rotated tokens, refused schema/partial batches, rejected configuration, lost acknowledgment, crash, central outage: `edgeConfig.test.ts`, `test-edge-history.mjs` | U D B |
| Daily operations → Sites | granted (site machines) | Supported | `test-edge-history.mjs` (offline site in the browser for a site-restricted viewer) | another site's edge hidden; silent site shown offline with its data end, never current | D B |
| Login → single sign-on; Settings → People & Access identity | everyone; admin maps groups and service accounts | Supported (owned OIDC provider) | `test-oidc.mjs` (browser sign-in, mappings and service accounts in the browser) | no mapped group, name takeover, group loss, back-channel logout and invalid logout tokens, session age, foreign client code, wrong issuer and CA, recovery-only passwords; service tokens outside scope, writes, expired, revoked | D B |
| Advanced → plants, OEE config, reports | admin | Supported | `test-access.mjs`, `oeeCalculationService.test.ts`, `test-report-pdf.mjs` | report generation vs delivery failure: `reportScheduler.test.ts`; deleted schedules, PDF retention and non-admin downloads: `test-report-boundaries.mjs` | U D B |
| Advanced → compliance, SPC, digital twins | admin | Experimental | `spcIsolation.test.ts`, `spcReference.test.ts`, `spcLive.test.ts`, `test-spc-live.mjs` (restart rebuild), `controlCharts.test.ts`, `test-control-charts.mjs` (declared I-MR/X̄-R charts in the browser), `test-compliance-audit.mjs` (browser integrity check), `assetOverview.test.ts` | concurrent audit writers, edited/deleted records, forged or unverified signatures 400; statistics not qualified on a real process (Q02); no regulatory claim | U D B |
| Advanced → recipes, batches | admin, only with `COMPLIANCE_MODE_ENABLED=true` | Experimental | `test-quality-line.mjs`, `test-batch-lifecycle.mjs`, `test-lot-corrections.mjs` (browser correction) | unknown/excluded readings never imply compliance; concurrent starts on one machine and complete/abort races leave one outcome, refusals shown; lot corrections below consumption, stale corrections, voiding a consumed output and cycle-closing restores refused | U D B |
| Help (`/help`) | everyone | Supported (static) | — | — | — |
| AI assistant | — | Removed (F05) | `e2e/p0.spec.ts` checks it is absent | — | B |

## Cross-cutting boundaries

| Boundary | Evidence | Levels |
| --- | --- | --- |
| Route × role × identifier matrix (REST and tRPC) | `accessMatrix.test.ts` (snapshot), `anonymous.test.ts`, `test-access.mjs`, `test-supervisor-workflows.mjs`; see [security boundaries](SECURITY_BOUNDARIES.md#access-matrix-f07) | U D B |
| Live sockets | `test-access.mjs` (rooms, alarm events, revocation), `socketSessions.test.ts`, `accessMatrix.test.ts` (no global broadcasts) | U D |
| Durable acquisition and replay | `test-recovery.mjs`, `measurementSpool.test.ts`, `opcuaQueueWorker.test.ts` (capacity, quarantine), `test-database-client-errors.mjs`, `test-spool-quarantine.mjs`, `test-collector-lock.mjs`, `test-collector-fencing.mjs` (fencing; two collector processes, takeover after kill -9, no duplicates) | U D S |
| Integration API v1 and webhook contract | `test-api-contract.mjs` runs `scripts/examples/integration-client.mjs`; `test-integration-outbox.mjs`; see [integration contract](INTEGRATION_API.md) | D B |
| History rollups and indexes | `test-history.mjs` (raw and retained summaries identical); `test-history-rollups.mjs` (state seconds and counter increments equal the shift calculation across two retention batches); `scripts/benchmark-history.mjs` *(local evidence)*, see [capacity](CAPACITY.md) | D |
| Installation, backup, restore, upgrade, rollback | `test-operations.mjs` (incl. restore after retention cancels pending deletions), `test-container.mjs` | D |
| Operational metrics | `operationalMetrics.test.ts`; real-database admin scrape and viewer refusal in `test-access.mjs` | U D |
| Accessibility (WCAG 2.2 A/AA) | `test-accessibility.mjs`: axe on seven screens with zero findings, keyboard login and widget layout, reduced motion, 320 px reflow; see [accessibility](ACCESSIBILITY.md) | B |
| Release packaging | `test-release-package.mjs` (signature, tampering, generated notes, compatibility required), `offline-package.mjs verify`; `release-evidence.mjs` collects CI and image evidence; see [releasing](RELEASING.md) | D |
| Offline outbound destinations | `test-offline-destinations.mjs`: unresolvable SMTP and webhook hosts fail visibly; the report still completes | D |
| Published examples | `test-examples.mjs`: no credentials; dashboard import and report template produce their documented output | D |
| Data ownership and audit scope | `test-data-ownership.mjs`: failed sign-ins, an export, retention steps, refused and accepted deletion, destination changes with the secret shown only at creation, grant and account changes with previous values; see [data ownership](DATA_OWNERSHIP.md) | D |
| Endurance | `test-installation-endurance.mjs` short run in CI; the 72-hour gate (FR01) is open | D B S |

## Harness notes

Database mocks are declared at module scope and app bootstrap has its own budget, which
resolved the nested-mock warnings and first-route timeouts seen on 2026-10-26
([P0 acceptance](P0_ACCEPTANCE.md)). Scripts marked *(local)* need owned simulators or
certificates that CI does not provision; run them before changing those areas.
