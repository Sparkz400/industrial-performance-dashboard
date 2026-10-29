# Performance Dashboard TODO

Created **2026-10-26** from a code review of `6b5556493e7c48687a43cc9d90df3aba0be1374e`
and [primary-source research](docs/RESEARCH.md). Read the [roadmap](docs/ROADMAP.md)
for product direction, milestones and the first execution sequence.

This is the **single task-status checklist**. Existing features are not represented
as newly completed work. Items marked Improve
extend or qualify existing code. New items add capabilities. Research items end
in a decision and may legitimately recommend not building a feature.

Initial scope: **111 items across 14 workstreams** — 54 improvements, 45 new
capabilities and 12 research decisions. The mix can change with pilot evidence.

- **P0:** blocks acceptance of the affected feature or deployment boundary.
- **P1:** needed for the useful first pilot or its immediate follow-through.
- **P2:** expansion after the relevant foundation is proven.
- **P3:** conditional experiment; needs demand and a go/no-go decision.
- **M0–M5:** target milestone from the roadmap, not a delivery date.
- **S / M / L / XL:** relative scope and uncertainty; split L/XL before implementation.
- **Depends:** prerequisite IDs; `none` means no backlog prerequisite, not zero setup.
- **Done:** required outcome/evidence. Check the item only with a PR/commit and
  validation reference appended. A simulator result does not qualify physical equipment.

Start with P01/F01/H01, then the roadmap's ordered first slice. Do not implement
all 14 workstreams simultaneously. Optional modules can remain disabled where a
boundary task explicitly permits that; a hidden incomplete feature is not completed
functionality.

## Execution update — 2026-10-26

### Backlog reconciliation — 2026-10-29

The checklist below lagged behind PRs #57, #59, #62, #63 and #64, whose acceptance
documents did not name backlog IDs. Each item was compared with its Done text and the
merged evidence: 23 items whose software criteria are covered by named tests were
checked with links, and stale progress notes now state the concrete remaining gap.
Items waiting for hardware, customers, supervised users or experimental-module
qualification stay open. The same day closed the remaining P0 software items F01,
F07, F08, F09, F10 and D01. A following P1 gap wave closed R04, O05, H05, D05 and U07;
backlog wave 1 closed E01, R05, R02 and A08, and recorded research decisions
([decisions](docs/RESEARCH_DECISIONS.md)): I08, E06 and X02 closed as rejected; the rest
stay open with explicit triggers.
Backlog status: 61 checked and 47 open; I06 is withdrawn.

### Data integrity and reviewed operations — 2026-10-28

The authorized implementation wave covers H03/H07/H10/U09/I04/M05: honest widgets,
reviewed measurement corrections, bounded calculated signals, explicit offline
drafts, reviewed CMMS handoffs and versioned energy estimates. See
[contracts, verification and remaining boundaries](docs/DATA_INTEGRITY.md).
This work is isolated from PR #63's endurance checkout. Physical-machine and CMMS
vendor acceptance remain separate; new software does not close the 72-hour gate.
### Factory operations expansion — 2026-10-28

The user authorized all six next steps: portable setup bundles (I05), connection
diagnostics (C09), alarm usefulness (A06), reviewed work-order exchange (I03),
practical asset overview (U08), and repeatable demonstration/release packaging
(P02/P04). See [implementation, usage and limits](docs/FACTORY_OPERATIONS.md).
This is a separate wave from PR #63 and does not close its 72-hour gate. Broader
backlog acceptance remains open where vendor, physical, trust or scale requirements
extend beyond these bounded software workflows.

### Factory readiness — 2026-10-28

Priorities 1–3 from the next-wave review cover full-application endurance,
supervisor/maintenance workflows and fair period comparisons. See
[scope and acceptance](docs/FACTORY_READINESS.md). Physical-machine qualification
remains separate. Completion receipts, not the existence of a test harness,
determine whether multi-day endurance has passed.

- [ ] **FR01 — Full-application endurance:** real OPC UA collection, durable replay,
  alarms, scheduled reports and browser sessions through owned interruptions;
  short smoke plus a separately recorded 72-hour run.
- [x] **FR02 — Supervisor work:** scoped line/action access, attributable maintenance
  corrections, stale-edit rejection, English/German and narrow-screen acceptance.
- [x] **FR03 — Fair comparisons:** frozen shift evidence, explicit incomparable
  reasons, optional verified energy differences and non-causal service context.

FR02/FR03 evidence: [PR #63](https://github.com/Sparkz400/performance_dashboard/pull/63) and
[validation record](docs/FACTORY_READINESS.md#software-validation--2026-10-28),
including the isolated supervisor/comparison browser fixtures. FR01's harness and
short-run recovery checks pass, but later sustained/CI failures keep its 72-hour
gate open. A reproduced checked-out database-client crash has a focused fix and
forced-disconnect regression; replacement full-application acceptance is pending.

### Daily factory workflows — current implementation

The authorized scope is priorities **1–4, 6 and 7** from the next-wave review.
Performance Dashboard is an independent product. TIA MCP integration is excluded.
Software implementation is complete on `codex/daily-factory-workflows`.
[Daily workflow acceptance](docs/DAILY_OPERATIONS_ACCEPTANCE.md) records tests and
remaining hardware/operator boundaries; [PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59) supplies integration evidence.

- [x] **DF01 — Access controls:** explicit operator/supervisor roles, machine/site
  grants, consistent REST/tRPC/socket/export boundaries and immediate revocation.
- [x] **DF02 — Historian:** bounded streaming exports, opt-in retention with exact
  previews, quality-aware summaries, disk forecasting and sustained-load evidence.
- [x] **DF03 — Production:** recurring calendars/holidays, multiple product runs,
  counter rollover policies and immutable report revisions.
- [x] **DF04 — Usability:** English/German, consistent freshness, focused navigation,
  measured loading improvements, keyboard/touch/accessibility acceptance.
- [x] **DF06 — Maintenance:** attributable service history, usage-based intervals,
  inspection actions and incident links.
- [x] **DF07 — Energy and loss:** meter accounting, energy per good part, idle and
  changeover losses, ranked downtime with coverage and independent reconciliation.

All existing data must survive additive migrations. Acceptance uses isolated
databases and owned simulators; physical S7-1500 qualification remains separate.

Factory-pilot software implemented and locally validated: the nominated controller family is **Siemens
SIMATIC S7-1500**. Implementation covers secure onboarding, installation/recovery,
operator and supervisor flows, unattended operation, a read-only gateway and
incident replay. Exact CPU/firmware/licence and physical-machine acceptance remain
unqualified. Each feature keeps its own acceptance gate; simulator evidence does
not close hardware or supervised-user gates.

- [x] Secure onboarding software and certificate/credential recovery checks.
- [x] Installation, complete backup/restore, actual earlier-image upgrade/rollback and capacity fixture.
- [x] Operator handover/actions, manual declarations and restricted supervisor wallboard.
- [x] Durable reports/email retries, alarm holds/hysteresis and collector/data incidents.
- [x] Read-only legacy reference gateway, owned simulator and reusable profile.
- [x] Bounded incident replay with clocks, quality/gaps, events, notes and export.

Evidence: [factory-pilot acceptance](docs/FACTORY_PILOT_ACCEPTANCE.md) maps each
software milestone to commits and tests. [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57)
tracks integration and hosted checks; broader backlog items keep their original
physical/customer gates. Consult the checks for the exact revision being used.

The read-only gateway software slice passes owned two-unit commissioning, profile
reuse, write rejection, bad-quality persistence, reconnect and managed identity
restart checks. See [gateway scope](docs/LEGACY_GATEWAY.md). This advances C04/C05/
C07/C10; real-device inventories and vendor qualification remain open.

The first P0 wave implements and tests F02/F04/F05/H01/H02 in
[PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40). Validation and
scope are recorded in [P0 acceptance](docs/P0_ACCEPTANCE.md).
The production-workflow wave completes F03/F06/A01 and the bounded stop-reason,
explainable-OEE and reconciled-report slice O02/O03/R01. See
[production acceptance evidence](docs/P0_ACCEPTANCE.md#production-workflow-wave).
DF01 adds the scoped REST/tRPC/socket/export role matrix to F07; broader release
review remains tracked separately. The remaining P0 software items were closed on
2026-10-29; see [security and deployment boundaries](docs/SECURITY_BOUNDARIES.md).

All 29 dependency PRs were reviewed. Fifteen obsolete or incompatible proposals
were closed with reasons; fourteen compatible proposals are consolidated into this
wave in [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40), whose
status records integration. See [PR dispositions](docs/DEPENDENCY_REVIEW.md).
Replacement Node 26 proposal #41 was also reviewed and closed. Docker major
updates now require an explicit F09 support decision; minor/patch updates continue.
New Gitleaks action PR #42 passed all required checks and was merged separately.

## Foundation

- [x] **F01 — Capture the current product contract** · P0 · M0 · Improve · S. Depends: none.
  Done: preserve fixtures for trend truncation, same-key machines, unwired alerts/webhooks,
  edge receive; map enabled screens to supported, experimental or
  disabled states and link each reproduced issue to its owning task.
  Completed: [PR #66](https://github.com/Sparkz400/performance_dashboard/pull/66); every route and tab is classified with its owning
  task in the [acceptance matrix](docs/ACCEPTANCE_MATRIX.md); trend, same-key, alarm
  and edge fixtures are listed in [P0 acceptance](docs/P0_ACCEPTANCE.md).
- [x] **F02 — Isolate SPC state and baselines** · P0 · M0 · Improve · M. Depends: F01, H01.
  Done: machine/tag/profile identities isolate baselines and rolling windows; two machines
  with identical keys and multiple profiles cannot contaminate or double-count samples.
  Keep SPC explicitly experimental until Q01/Q02 qualify its statistics.
  Completed: [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40);
  [validation and limits](docs/P0_ACCEPTANCE.md).
- [x] **F03 — Prove a real alert-to-delivery path** · P0 · M0 · Improve · M. Depends: F01.
  Done: trace a simulator event through the UI-created rule, evaluator, persisted history
  and configured delivery; identify one supported engine, and disable or migrate unwired
  alternatives. Verify real event wiring separately from webhook test delivery.
  Completed: [PR #51](https://github.com/Sparkz400/performance_dashboard/pull/51); [tests and limits](docs/P0_ACCEPTANCE.md#production-workflow-wave).

- [x] **F04 — Make edge status honest** · P0 · M0 · Improve · S. Depends: F01.
  Done: UI/API/docs distinguish queued, transferred and queryable-in-history states;
  unfinished central ingestion is disabled or labeled experimental; reconnect/retry
  cannot be presented as proof that a central historian contains the measurements.
  Completed: [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40);
  [validation and limits](docs/P0_ACCEPTANCE.md).
- [x] **F05 — Remove the AI assistant** · P0 · M0 · Remove · S.
  Removed the assistant UI, backend endpoint, external-provider calls and configuration,
  shared contracts and associated provider tests. AI assistance is outside product scope.
- [x] **F06 — Qualify durable acquisition failures** · P0 · M0 · Improve · L. Depends: H01.
  Done: test process termination, database outage, spool reopen, disk-full and replay
  interruption; account for every durably accepted event and expose unreceived/unknown
  intervals. Define behavior before storage exhaustion rather than silently dropping data.
  Completed: [PR #51](https://github.com/Sparkz400/performance_dashboard/pull/51); [tests and limits](docs/P0_ACCEPTANCE.md#production-workflow-wave).

- [x] **F07 — Audit every data-access boundary** · P0 · M0 · Improve · L. Depends: F01.
  Done: negative tests cover admin/viewer, REST, tRPC, sockets, reports, shares and exports;
  machine identifiers cannot bypass authorization. Document one-company deployment
  limits and close any unintended access found before accepting the affected feature.
  Completed: [PR #66](https://github.com/Sparkz400/performance_dashboard/pull/66); a generated matrix covers all 244 policy routes and
  every tRPC procedure for each non-admin role with granted, foreign and absent
  identifiers (`accessMatrix.test.ts`), plus an anonymous sweep. The audit closed a
  socket broadcast of every machine's alarms, a live-value room collision and an
  owner-list disclosure; regressions in `test-access.mjs`.
  [Matrix, findings and limits](docs/SECURITY_BOUNDARIES.md#access-matrix-f07).
- [x] **F08 — Constrain public shares and embeds** · P0 · M0 · Improve · M. Depends: F07.
  Done: revocation/expiry work for page, API and live updates; shared views reveal only
  selected data, have explicit lifetime and embedding rules, and exclude administrative
  metadata. Expired sessions/shares stop receiving newly streamed data.
  Completed: [PR #66](https://github.com/Sparkz400/performance_dashboard/pull/66); administrators create expiring (≤30 days), hashed,
  revocable links to frozen trend selections with a bounded window and per-link
  embedding origins. Every refresh re-checks the link and its creator; revoked or
  expired pages clear their data. `shareService.test.ts`, `test-shares.mjs`;
  [contract](docs/SECURITY_BOUNDARIES.md#selected-data-links-f08).

- [x] **F09 — Resolve security findings against the actual release** · P0 · M0 · Improve · M. Depends: F01.
  Done: review dependency, container and code-scanning reports for the exact commit/image;
  fix actionable findings or record scope, mitigation and owner for accepted residual
  risk. Test outbound URLs, uploads, SVG, CSRF and secrets handling at their boundaries.
  Progress: [dependency review](docs/DEPENDENCY_REVIEW.md), clean root install and
  peer validation; full runtime/development npm audit zero. Scoped UUID/esbuild fixes,
  Storybook builds, Drizzle transforms/generation and CSRF/socket-origin regressions pass.
  Follow-up: qualify coordinated MUI, Storybook/Vite, lint, Vitest 5, virtualization,
  grid-layout and Node major migrations. The full boundary audit remains open.
  Image remediation complete: Node 24/Wolfi with direct PDF rendering removes the
  Debian/Chromium runtime. Full Trivy scan: zero findings across 28 OS and 557 Node
  packages. CI blocks all high/critical findings, including unfixed ones. Actual-image
  collection, crash/outage replay, scheduled PDF/download, email attachment and report
  persistence checks pass. [Migration evidence and limits](docs/REPORTING.md).
  Maintainers must rescan each release.
  Completed: [PR #66](https://github.com/Sparkz400/performance_dashboard/pull/66); CodeQL, Trivy (image `sha256:8c03215…`), npm audit,
  Dependabot and secret scanning report zero open findings for `04383cae`; outbound URL,
  SVG, body-size, CSRF and secrets boundaries have tests; residual risks have an owner
  and mitigation. [Review record](docs/SECURITY_BOUNDARIES.md#release-security-review-f09).
  The branch's own PR checks must pass before release.
- [x] **F10 — Create a feature-level acceptance matrix** · P0 · M0 · Improve · M. Depends: F02, F03, F06, F07.
  Done: enabled pilot features have happy-path and failure-path evidence; distinguish
  unit, database, browser, simulator and physical-machine checks. CI success alone never
  promotes an experimental module or a new machine family to supported status. Resolve
  test-harness deprecation warnings, including nested mock declarations, before upgrades;
  investigate the first-route timeouts observed in the parallel 2026-10-26 test run.
  Progress: top-level mocks and separate app-bootstrap budget resolve the observed
  harness issues; [feature evidence](docs/P0_ACCEPTANCE.md) names remaining negative tests.
  Completed: [PR #66](https://github.com/Sparkz400/performance_dashboard/pull/66); [acceptance matrix](docs/ACCEPTANCE_MATRIX.md) with
  per-screen state, happy/failure evidence and U/D/B/S/P levels; no row claims physical evidence.

Implemented and locally validated on `codex/production-shift-workflow`; integration
and current-head CI are tracked by [PR #51](https://github.com/Sparkz400/performance_dashboard/pull/51). The application is running
locally with additive migrations and existing data preserved. Wider backlog items
below retain their unfulfilled acceptance criteria.

## Connectivity

- [x] **C01 — Support protected OPC UA user identities** · P0 · M0 · Improve · L. Depends: F09.
  Done: username/password and user-certificate identity paths are explicitly supported
  or scoped per endpoint, secrets are protected/redacted, rotation works, and wrong
  credentials fail clearly. Qualify with read-only permissions on owned test servers.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  encrypted credentials, username/X.509 sessions, rotation, redaction and secure
  browser/collector acceptance in `scripts/test-secure-machine.mjs`;
  [scope](docs/FACTORY_PILOT_ACCEPTANCE.md). Exact S7-1500 CPU/firmware identity
  settings remain a physical gate in the [pilot guide](docs/S7_1500_PILOT.md).
- [x] **C02 — Complete certificate and endpoint trust lifecycle** · P0 · M0 · Improve · M. Depends: C01.
  Done: expiry, rejected peers, identity/hostname mismatch and renewal have actionable
  diagnostics; trust requires an explicit decision. Test an expired certificate and
  a changed endpoint without silently downgrading channel security.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  explicit trust, fingerprint/expiry UI, and owned-server negative checks for
  endpoint-host mismatch, expired and not-yet-valid certificates in
  `scripts/test-secure-machine.mjs`; renewal in the [S7-1500 guide](docs/S7_1500_PILOT.md).
- [x] **C03 — Add a commissioning preflight** · P1 · M1 · New · M. Depends: C01, H01.
  Done: a guided check reports connection, identity, trust, browse/read permission,
  source time and sample quality; users can save a redacted diagnostic report without
  scanning arbitrary networks or issuing machine writes.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  exact-endpoint check, read/type/quality/source-time preview, protected identities,
  explicit trust and redacted diagnostic download pass owned-server/browser acceptance.

- [ ] **C04 — Build reusable, versioned machine profiles** · P1 · M1 · New · L. Depends: C03.
  Done: profiles include namespace-aware signals, types, units, scales, state meanings,
  counters and supported endpoint versions; import previews differences and requires
  review. A second simulator instance can be commissioned without source edits.
  Progress: Immutable namespace-aware profiles support validation, import review, export and reuse.
  The read-only gateway commissions two owned units from one profile
  ([gateway scope](docs/LEGACY_GATEWAY.md)) and reviewed setup bundles copy mappings
  to a paused second machine ([PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64)).
  Remaining: supported endpoint/vendor version declarations qualified against real devices.

- [ ] **C05 — Define a connector contract and gateway recipes** · P1 · M2 · New · L. Depends: C04, H01.
  Done: normalize source identity, quality, timestamps and reconnect behavior; demonstrate
  one actual legacy-device gateway path and document costs/prerequisites. Use an approved
  gateway before adding a native driver unless the pilot establishes a clear need.
  Progress: the read-only Modbus TCP gateway normalizes identity, quality, timestamps and
  reconnects against an owned two-unit fixture ([gateway scope](docs/LEGACY_GATEWAY.md),
  [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57)). Blocker: an
  actual legacy device from the pilot inventory (P01).
- [ ] **C06 — Add MQTT ingestion and evaluate Sparkplug** · P2 · M2 · New · XL. Depends: C05.
  Done: authenticated TLS, topic authorization, mapping validation and duplicate/out-of-order
  fixtures pass. If Sparkplug is selected, qualify birth/death, rebirth, session and metric
  identity; broker delivery guarantees are not advertised as end-to-end exactly-once history.
  Decision 2026-10-29: DEFER until P01 names an MQTT-only source; Sparkplug rebirth commands would need an explicit exception to read-only operation. [decision](docs/RESEARCH_DECISIONS.md#c06--add-mqtt-ingestion-and-evaluate-sparkplug).
- [ ] **C07 — Select one brownfield protocol extension** · P2 · M2 · Research · L. Depends: C05.
  Done: rank Modbus TCP/RTU, MTConnect and vendor gateways against the pilot inventory;
  implement at most the selected initial adapter with fixtures for byte order, scaling,
  unavailable values or sequence reset as applicable, and document unsupported devices.
  Progress: Modbus TCP (read-only 03/04) is the provisional adapter with owned fixtures.
  Blocker: ranking needs the real pilot device inventory (P01).
  Decision 2026-10-29: DEFER. Modbus TCP 03/04 stays the only provisional adapter; rank options by the documented rule once the P01 inventory exists. [decision](docs/RESEARCH_DECISIONS.md#c07--select-one-brownfield-protocol-extension).
- [ ] **C08 — Suggest mappings from OPC UA information models** · P2 · M3 · New · L. Depends: C04.
  Done: detect declared Machinery/selected companion-model capabilities using namespace
  URIs and type information; show suggestions with provenance and confidence, require
  approval, and fall back cleanly when a server only exposes proprietary tags.
- [x] **C09 — Expose subscription limits and diagnostics** · P1 · M2 · Improve · M. Depends: C01, H01.
  Done: requested/revised sampling, queue sizes, rejected items, reconnects and late/stale
  data are visible; load tests avoid reconnect storms and reveal overflow risk. Limits
  are configurable per endpoint and never assumed identical across machines.
  Progress: Connection diagnostics show requested/revised sampling, monitored-item
  status, queue settings, reconnect observations and freshness
  ([PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64),
  [scope](docs/FACTORY_OPERATIONS.md#connection-diagnostics-and-alarm-review)); sampling
  is configurable per signal. Completed (wave 2): per-endpoint publishing interval, queue size and
  notifications per publish in the machine form; `test-subscription-limits.mjs` shows requested/revised
  values and server overflow indications with a queue of 2, then refuses and restores seven clients
  on one owned server and records spread first reconnect delays (node-opcua drops the randomisation
  factor on reconnection, so each client gets its own initial delay).
- [ ] **C10 — Publish a connector qualification harness** · P1 · M2 · New · L. Depends: C05.
  Done: each enabled adapter replays disconnect, duplicate, bad-quality, type-change and
  timestamp fixtures; a compatibility entry names vendor/model/firmware/server, mappings,
  software commit and outstanding limits. Simulator success is listed separately.
  Progress: OPC UA and gateway fixtures cover disconnect, bad quality and timestamps
  (`test-gateway.mjs`, `test-signal-quality.mjs`); [compatibility](docs/COMPATIBILITY.md)
  lists simulator evidence separately. Blocker: no real vendor/model/firmware entry yet.

## Historian

- [x] **H01 — Establish stable signal and measurement identity** · P0 · M0 · Improve · L. Depends: none.
  Done: machine/source identity, namespace URI, signal type, raw value, quality, units,
  source/receive time and event ID survive storage/replay; two machines sharing a key
  remain distinct. Migrations preserve existing measurements and document ambiguous legacy rows.
  Completed: [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40);
  [validation and limits](docs/P0_ACCEPTANCE.md).
- [x] **H02 — Represent the complete selected trend interval** · P0 · M0 · Improve · M. Depends: H01.
  Done: dense short and long windows include the end of the requested interval through
  bounded aggregation/pagination, rather than silently returning the oldest 2,000 samples;
  responses disclose resolution and any truncation, with regression tests above the cap.
  Completed: [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40);
  [validation and limits](docs/P0_ACCEPTANCE.md).
- [x] **H03 — Carry coverage and quality into every view** · P0 · M0 · Improve · M. Depends: H02.
  Done: trend, tooltip, KPI and report contracts distinguish bad quality, missing samples,
  stale values and valid zero; source/receive times and known gaps remain inspectable.
  Continuous interpolation across an unknown interval is never implied without disclosure.
  Progress: trends preserve zero/null, report whole-window statistics and disclose
  sampled/unknown continuity. The integrity wave replaces generated legacy widgets,
  propagates quality/staleness/unknown states and exposes source evidence; see
  [integrity verification](docs/DATA_INTEGRITY.md#verification). Experimental screens
  retain their separate qualification requirements.
  Completed software: [implementation `019be8e0`](https://github.com/Sparkz400/performance_dashboard/commit/019be8e068e06e3abbb0ab14c472ca58c61d508e);
  [verification and separate qualification boundaries](docs/DATA_INTEGRITY.md#local-checkpoint-validation--2026-10-28).
- [x] **H04 — Stream and bound historical exports** · P1 · M2 · Improve · M. Depends: H01.
  Done: large exports use bounded memory, cancellation and query limits, retain identity,
  units, timestamps and quality, and clearly label raw versus aggregated output. Protect
  spreadsheet consumers from formula injection and test partial/failing downloads.
  Completed: [PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59);
  `scripts/test-history.mjs` (200,000-row stream, disconnected-reader cursor release,
  explicit aggregation); [contract](docs/DAILY_OPERATIONS.md#history-storage-and-retention).
- [x] **H05 — Introduce an explicit retention policy** · P1 · M2 · New · L. Depends: D04, H04.
  Done: preview storage impact and exact deletion scope, preserve required evidence,
  schedule bounded cleanup and verify backup/restore interactions. No historical data
  is deleted by default merely because a new version was installed.
  Completed: opt-in policy, exact reviewed previews, protected evidence and bounded
  deletion ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59),
  [PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)). [PR #67](https://github.com/Sparkz400/performance_dashboard/pull/67)
  makes restores cancel pending deletions; `test-operations.mjs` backs up while a deletion
  is scheduled, runs it on the source, restores, and proves the raw rows return, no summary
  double-counts them and neither the schedule nor a replay deletes anything.
- [ ] **H06 — Add quality-aware rollups and query tuning** · P1 · M2 · Improve · L. Depends: H05, H02.
  Done: benchmark existing indexes first; implement only justified indexes/partitioning
  and rollups retaining count, extrema and quality coverage. Compare raw/aggregate results
  and preserve state durations and counter semantics instead of averaging every tag.
  Progress: hourly quality summaries retain counts/status for removed rows
  ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)). Remaining: index
  benchmark and raw/aggregate comparison on a sustained dataset (D04). Wave 2: `test-history.mjs`
  shows raw and retained-summary answers identical for 72 hourly buckets; `benchmark-history.mjs`
  records endpoint timings and index use on 5.2 million synthetic rows ([capacity](docs/CAPACITY.md)).
  Remaining: state-duration and counter-increment rollups so retention never reduces those tags to averages.
- [x] **H07 — Handle late and corrected measurements predictably** · P1 · M2 · New · L. Depends: H01.
  Done: event-time ordering, duplicate identities and late arrivals have a defined policy;
  affected aggregates are recomputed with provenance and finalized reports keep their
  original revision. Test out-of-order timestamps and invalid/future clock readings.
  Completed software: [implementation `019be8e0`](https://github.com/Sparkz400/performance_dashboard/commit/019be8e068e06e3abbb0ab14c472ca58c61d508e);
  [verification and separate qualification boundaries](docs/DATA_INTEGRITY.md#local-checkpoint-validation--2026-10-28).
- [ ] **H08 — Complete authenticated edge-to-central history** · P2 · M4 · Improve · XL. Depends: F04, H01, I01, E01.
  Done: edge identity and allowed schemas are checked; receiver writes canonical records
  transactionally and acknowledges committed identities. Resume after lost responses,
  partial batches and process crashes without duplicates or silent loss; revoke a node.
  Decision 2026-10-29: DEFER until a sponsor names at least two sites and central viewers; I01 and site-qualified identity come first. [decision](docs/RESEARCH_DECISIONS.md#h08--complete-authenticated-edge-to-central-history).
- [ ] **H09 — Provide spool and storage capacity controls** · P1 · M2 · Improve · M. Depends: D04, H04.
  Done: operators see backlog age/bytes, disk runway, write failures and recovery rate;
  export/quarantine recovery has audit evidence. Define backpressure and alert thresholds
  using measured capacity, while preserving all acknowledged records within that boundary.
  Progress: One-million-event cap, 64 MiB reserve and visible backlog/failure status stop acquisition before loss.
  Measured disk runway and storage incidents ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62))
  and reviewed retention (H05) are implemented. Wave 2: capacity, reserve, backlog-age and runway
  thresholds are configurable (80% capacity warns before the stop); operators see spool bytes, age,
  rows written per minute and the last write failure; records PostgreSQL refuses are quarantined on
  the collector with audited export/retry (`test-spool-quarantine.mjs`). Remaining: choose production
  values from the D04 measured envelope.

- [x] **H10 — Add reusable derived signals safely** · P2 · M3 · New · L. Depends: H02, H04.
  Done: a bounded expression model supports units, quality propagation and versioning;
  no arbitrary server code executes. Test division by zero, incompatible units, missing
  inputs and replay reproducibility before using a derived value in production KPIs.
  Completed software: [implementation `019be8e0`](https://github.com/Sparkz400/performance_dashboard/commit/019be8e068e06e3abbb0ab14c472ca58c61d508e);
  [verification and separate qualification boundaries](docs/DATA_INTEGRITY.md#local-checkpoint-validation--2026-10-28).
## Production and OEE

- [x] **O01 — Make shifts and calendars first-class** · P1 · M1 · New · L. Depends: H01.
  Done: site timezone, overnight shifts, breaks, holidays and DST transitions produce
  explicit planned-production windows; no double-counting at boundaries. Explain the
  difference between scheduled time, observed time and missing coverage.
  Completed: [PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59);
  recurring IANA calendars, holidays, DST rejection/disambiguation and repeat-safe
  publication in `scripts/test-daily-workflows.mjs`;
  [contract](docs/DAILY_OPERATIONS.md#calendars-product-runs-and-frozen-reports).

- [x] **O02 — Add structured downtime reasons and corrections** · P1 · M1 · New · L. Depends: O01.
  Done: detected stops can be categorized, split or corrected with actor/reason/history;
  planned/unplanned/unknown are distinct, overlaps are rejected, and corrected results
  can be reproduced without destroying the original machine timeline.
  Completed: [PR #51](https://github.com/Sparkz400/performance_dashboard/pull/51); [tests and limits](docs/P0_ACCEPTANCE.md#production-workflow-wave).

- [x] **O03 — Make OEE explainable down to its inputs** · P1 · M1 · Improve · M. Depends: O02.
  Done: drill from availability/performance/quality to mapped signals, production window,
  excluded periods and counts; identify suspicious values above 100% without silently
  clamping them. Show missing prerequisites and the calculation revision.
  Completed: [PR #51](https://github.com/Sparkz400/performance_dashboard/pull/51); [tests and limits](docs/P0_ACCEPTANCE.md#production-workflow-wave).

- [x] **O04 — Add product and work-order context** · P1 · M1 · New · L. Depends: O01, C04.
  Done: jobs have stable IDs, product, target quantity, ideal cycle and effective periods;
  selecting a job does not write to the machine. Product changes preserve historical
  context and prevent current standards from silently altering older OEE results.
  Completed: [PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59) (up to
  thirty non-overlapping product runs per shift, each with job/target/ideal cycle, frozen
  report revisions) and [PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64)
  (stable external work-order identities); `test-daily-workflows.mjs`, `test-work-orders.mjs`.

- [x] **O05 — Qualify counters, rejects and manual quantities** · P1 · M1 · Improve · L. Depends: O04.
  Done: support explicit reset/rollover policies, counter width and discontinuities;
  manual entries are timestamped deltas or declared snapshots with correction history.
  Tests prevent duplicated totals, negative production and inferred perfect quality.
  Completed: reset-to-zero, reject-decrease and declared rollover with an explicit modulus
  ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)); revisioned operator
  declarations ([PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57)).
  [PR #67](https://github.com/Sparkz400/performance_dashboard/pull/67) applies the latest
  reviewed declaration as a declared shift snapshot: it
  replaces only incomplete counters, is labelled, never verifies the shift, and is flagged
  when complete counters differ (`shiftCalculation.test.ts`, `test-daily-workflows.mjs`).
  Sampling and rollover behaviour on the physical machine stay with the S7-1500 pilot (D06).

- [ ] **O06 — Measure setup and changeover loss** · P2 · M3 · New · M. Depends: O04, O02.
  Done: expected/actual changeover periods use product transitions and operator-confirmed
  context; overlapping runs and unobserved transitions remain visible. Compare comparable
  changeovers rather than ranking unrelated jobs or operators.
  Progress: changeover is an explicit stop category with energy/loss accounting
  ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)). Remaining:
  expected-versus-actual changeover from product transitions and comparable grouping.
- [ ] **O07 — Analyze microstops and cycle distributions** · P2 · M3 · New · L. Depends: O02.
  Done: configurable thresholds distinguish short stops and slow cycles; histograms,
  percentiles and loss Pareto preserve acquisition-resolution limits. A 1 Hz sample
  stream must not claim precise detection of sub-second events.
  Progress: line investigations report bounded microstops and p50/p90/p95 cycle durations
  ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62),
  [scope](docs/QUALITY_LINE_OPERATIONS.md#production-line-investigations)). Remaining:
  histograms and an explicit acquisition-resolution limit on short-stop detection.
- [ ] **O08 — Add line topology and bottleneck analysis** · P2 · M3 · New · XL. Depends: O07, O05.
  Done: model buffers, blocked/starved states and selected serial/parallel paths; compare
  against a known line scenario. Report candidate constraints and uncertainty rather
  than equating correlated downtime with proven root cause.
  Progress: acyclic line definitions with buffers, blocked/starved states and withheld
  low-coverage candidates are implemented ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)).
  Remaining: validation against a known physical line scenario.
- [ ] **O09 — Reconcile a shift against independent evidence** · P1 · M1 · Improve · M. Depends: O01, O04.
  Done: a reconciliation view compares source counters, accepted good/reject quantities,
  operator adjustments and planned/observed time; unresolved differences are explicit
  and prevent a report from being labeled verified.
  Progress: A recorded independent ledger must match total/good/reject quantities; differences prevent verification.
  Reviewed operator declarations now appear in the report beside measured counts (O05).
  Remaining: a supervised physical shift reconciliation (D06).

- [ ] **O10 — Support machines with limited automatic data** · P2 · M2 · New · M. Depends: O02, U06.
  Done: authorized manual counts/state intervals and approved sensor/gateway signals can
  support a bounded workflow; provenance and coverage distinguish manual from automatic
  evidence. Users cannot manufacture a complete OEE number from missing inputs.

## User experience

- [ ] **U01 — Guide the first machine-to-dashboard journey** · P1 · M1 · New · L. Depends: C03.
  Done: endpoint, signal selection, meaning, preview and dashboard creation form one
  recoverable flow; a new user finishes the owned simulator setup without source edits.
  Failed steps explain the relevant permission, certificate or mapping issue.
  Progress: The browser-tested flow checks, maps, previews, reviews, saves and creates a dashboard for the owned simulator.
  Protected-endpoint identity/trust failures pass browser acceptance (C03). Remaining:
  supervised first-time-user acceptance.

- [x] **U02 — Unify freshness, loading and failure states** · P1 · M1 · Improve · M. Depends: H02.
  Done: widgets consistently show last measurement, connection state, missing coverage
  and empty/error states; stale data cannot resemble a live healthy machine. Verify
  small-screen and wall-display readability with real rendered examples.
  Completed: [PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)
  (consistent freshness, 390-pixel and wallboard browser flows) and
  [PR #65](https://github.com/Sparkz400/performance_dashboard/pull/65) (generated widget
  data replaced by evidence-backed unknown/stale/bad-quality states;
  [verification](docs/DATA_INTEGRITY.md#verification)). Viewing-distance acceptance stays in U05.
- [ ] **U03 — Create a focused operator workspace** · P1 · M1 · New · L. Depends: O02, O04.
  Done: an operator sees the current job, stops needing reasons, authorized quality input
  and handover actions in a short touch-friendly flow. Acknowledgment and classification
  are application actions; machine control is not introduced.
  Progress: Production workspace supports shift context, stop classification/corrections,
  attributable handover/actions and reviewed operator quantity declarations. Mobile
  browser acceptance is covered in `scripts/test-operator.mjs`; supervised operator
  and accessibility qualification remain open. See [operator workflow](docs/OPERATOR_WORKFLOW.md).

- [x] **U04 — Add shift handover notes and action ownership** · P1 · M1 · New · M. Depends: U03.
  Done: notes link to machine/job/interval, have an owner and resolved/open state, and
  appear in the next handover. Edits are attributable; attachments, if enabled, are
  size/type constrained and permission checked.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  durable idempotent entries, immutable revisions, ownership, due dates, interval/shift
  validation and conflict protection in `scripts/test-operator.mjs`; attachments are
  disabled. [Workflow](docs/OPERATOR_WORKFLOW.md).
- [ ] **U05 — Deliver a useful supervisor wallboard** · P1 · M1 · Improve · M. Depends: U02.
  Done: a selected line shows state, target progress, prioritized issues and freshness;
  kiosk rotation reconnects cleanly and uses a restricted identity. Screens remain
  legible at the agreed viewing distance and do not depend on color alone.
  Progress: Six-machine pages, selection/rotation/fullscreen, observed target progress,
  freshness/unknown states and a read-only account are browser tested. Viewing-distance
  and sustained display acceptance remain open; see [workflow](docs/OPERATOR_WORKFLOW.md).
- [ ] **U06 — Establish accessible interaction patterns** · P1 · M1 · Improve · L. Depends: none.
  Done: commissioning, login, dashboards and operator actions support keyboard focus,
  non-drag alternatives, semantic labels and screen-reader status; test contrast, zoom,
  reduced motion and touch targets against an explicit WCAG 2.2 acceptance checklist.
  Progress: keyboard focus, skip link, 44-pixel coarse-pointer targets and touch flows
  are browser tested ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)).
  Remaining: the explicit WCAG 2.2 checklist, screen-reader and reduced-motion checks.
- [x] **U07 — Improve navigation, localization and display units** · P1 · M1 · Improve · M. Depends: U02, F07.
  Done: role-appropriate navigation, machine search and saved filters reduce clutter;
  English/German, dates, decimal formats and display units follow a declared locale.
  Stored measurement units remain unchanged by display preferences.
  Completed: role-focused navigation and English/German core workflows
  ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)); [PR #67](https://github.com/Sparkz400/performance_dashboard/pull/67)
  adds a searchable machine picker and a per-account remembered machine/tab on Daily
  operations, and shared language-aware number, percent and date formatting
  (`i18n.test.ts`, `test-daily-workflows.mjs`). Scope: units are shown exactly as stored
  and never converted; the operator workspace keeps its existing machine selector.
- [x] **U08 — Turn the SVG twin into a practical asset view** · P2 · M3 · Improve · L. Depends: U02.
  Done: templates bind verified signals, stale/bad quality is visible, and users can
  navigate from a component to history and maintenance context. Sanitized content cannot
  escape its boundary; describe this as visualization, not a physics simulation.
  Completed: [PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64);
  `scripts/test-asset-overview.mjs`; [scope](docs/FACTORY_OPERATIONS.md#practical-asset-overview).
- [x] **U09 — Define a safe offline operator mode** · P2 · M3 · New · L. Depends: U03, I01.
  Done: cached data is explicitly stale, logout clears protected local material, and
  queued application edits have stable identities, conflict review and expiry. A reconnect
  does not duplicate notes/counts or imply machine actions occurred while offline.
  Completed software: [implementation `019be8e0`](https://github.com/Sparkz400/performance_dashboard/commit/019be8e068e06e3abbb0ab14c472ca58c61d508e);
  [verification and separate qualification boundaries](docs/DATA_INTEGRITY.md#local-checkpoint-validation--2026-10-28).
- [ ] **U10 — Reduce dashboard loading and rendering cost** · P1 · M2 · Improve · M. Depends: U02, D04.
  Done: measure startup, navigation, memory and live-update behavior on an ordinary
  operator device; reduce large dashboard bundles and unnecessary renders where profiles
  justify it. Preserve accessible loading states and compare results on the same workload.
  Progress: deferring the widget library reduced the dashboard page chunk from 3.9 MB to
  about 54 KB ([acceptance](docs/DAILY_OPERATIONS_ACCEPTANCE.md#measured-bounds)).
  Remaining: startup/navigation/memory/live-update timing on an ordinary operator device.

## Alerts

- [x] **A01 — Consolidate the alarm and alert lifecycle** · P0 · M0 · Improve · L. Depends: F03, H01.
  Done: one documented rule/event model connects configuration, evaluation, history and
  subscriptions; migrate existing rules without duplicate notifications. Active, cleared,
  acknowledged and unknown states have consistent semantics across API and UI.
  Completed: [PR #51](https://github.com/Sparkz400/performance_dashboard/pull/51); [tests and limits](docs/P0_ACCEPTANCE.md#production-workflow-wave).

- [x] **A02 — Add debounce, hysteresis and minimum duration** · P1 · M1 · Improve · M. Depends: A01.
  Done: noisy thresholds do not flood history; boundaries and clear conditions are
  documented and replay-tested. Bad/stale input suspends or changes evaluation explicitly
  instead of producing a false recovery.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  persistent trigger/recovery holds, hysteresis, gap/quality/order resets and UI
  configuration with unit and owned replay tests (`scripts/test-unattended-alarms.mjs`);
  [unattended operation](docs/UNATTENDED_OPERATION.md).
- [x] **A03 — Alert on data and collector health** · P1 · M1 · New · M. Depends: A01, H03.
  Done: users can distinguish machine-condition alarms from disconnected endpoint,
  stale signal, bad quality and growing backlog; simulate each condition and verify
  recovery behavior without inventing machine state.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  `scripts/test-unattended-alarms.mjs` raises and resolves stale-data, disconnected,
  bad-quality and collector-backlog incidents. External outage monitoring of the
  application itself remains a deployment responsibility ([unattended operation](docs/UNATTENDED_OPERATION.md)).
- [x] **A04 — Add ownership, acknowledgment and maintenance suppression** · P1 · M1 · Improve · M. Depends: A01.
  Done: acknowledgment records actor/time/comment, suppression is scoped and time-bounded,
  and expiration is visible. A dashboard acknowledgment never silently acknowledges
  or clears an alarm in the PLC.
  Completed: [PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62);
  alarm owners/escalation owners, suppression with an explicit end within 24 hours and
  read-only acquisition; `scripts/test-quality-line.mjs`;
  [scope](docs/QUALITY_LINE_OPERATIONS.md#maintenance-actions-and-notifications).
- [ ] **A05 — Deliver escalation and notification policies** · P2 · M2 · New · L. Depends: A04, I01.
  Done: email/webhook destinations have testable routing, quiet hours, escalation and
  durable retry state; credentials are protected and delivery failure is visible.
  Test restarts and a receiver outage without uncontrolled notification floods.
  Progress: Alarm webhooks have durable retries, HMAC signatures, stable receiver deduplication IDs and visible attempt status.
  UTC quiet hours and one-time overdue escalation through webhooks are implemented
  ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)). Remaining:
  alarm email destinations and routing beyond webhooks.

- [x] **A06 — Measure alert usefulness and flood behavior** · P2 · M2 · New · M. Depends: A04.
  Done: show repeated/chattering alarms, acknowledgment delays and muted items; distinguish
  operator response time from delivery delay. Tune thresholds against replayed incidents
  and keep actionable history rather than deleting inconvenient events.
  Completed: [PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64);
  `scripts/test-operational-diagnostics.mjs`; read-only threshold replay and
  [scope](docs/FACTORY_OPERATIONS.md#connection-diagnostics-and-alarm-review).
- [ ] **A07 — Evaluate OPC UA Alarms and Conditions ingestion** · P2 · M3 · Research · L. Depends: A01, C02.
  Done: demonstrate supported event fields, conditions, reconnect refresh and severity
  mapping with an owned server; preserve source event identity. Read-only observation is
  the default; PLC-side acknowledgment remains outside this task.
  Decision 2026-10-29: DEFER. S7-1500 A&C needs FW V2.9+ and a runtime licence; build once P01 confirms configured, wanted PLC alarms and approves ConditionRefresh as the only method call. [decision](docs/RESEARCH_DECISIONS.md#a07--evaluate-opc-ua-alarms-and-conditions-ingestion).
- [x] **A08 — Preserve alert evaluation across restarts** · P1 · M2 · Improve · M. Depends: A01, H01.
  Done: cooldown/window state has a documented rebuild/persistence policy; restart and
  historical replay cannot silently suppress a new incident or resend every old one.
  Event time and evaluation time remain distinguishable.
  Progress: Rule/machine state and unique receipts survive evaluator restart and identical-timestamp replay; failed transactions consume no receipt/cooldown.
  Completed: [PR #68](https://github.com/Sparkz400/performance_dashboard/pull/68) records every rule version with a database trigger and judges
  replayed samples by the version in force at receipt; uncovered samples are logged,
  not judged (`alarmConditions.test.ts`, `test-alarm-replay.mjs`;
  [policy](docs/UNATTENDED_OPERATION.md#reduce-noisy-alarms)).

## Reporting

- [x] **R01 — Produce a reconciled shift report** · P1 · M1 · Improve · L. Depends: O01, O02, O04.
  Done: report planned time, quantities, loss reasons, OEE inputs and coverage for the
  exact shift/product scope; match the dashboard and independent fixture. Missing data
  and unresolved reconciliation prevent an unqualified verified label.
  Completed: [PR #51](https://github.com/Sparkz400/performance_dashboard/pull/51); [tests and limits](docs/P0_ACCEPTANCE.md#production-workflow-wave).

- [x] **R02 — Make reports useful for daily decisions** · P1 · M1 · Improve · M. Depends: R01, U02.
  Done: include the largest losses, unresolved actions, data freshness and drill-through
  references with readable PDF/print layouts. Review a real rendered report; formatting
  must not hide incomplete data or change numeric precision silently.
  Completed: [PR #68](https://github.com/Sparkz400/performance_dashboard/pull/68) adds open handover notes/actions linked to the shift (owner,
  priority, due time, `#id` reference) to the report JSON, page and printed PDF;
  `test-production.mjs` renders and prints it, `test-daily-workflows.mjs` checks ownership.
  Progress: Largest losses, gaps, inputs and readable print/JSON output are implemented and rendered.
  Scheduled PDF migration: existing trend/alarm/OEE sections, Unicode fonts, multipage
  tables, unknown-data notices and downloads are verified without a server browser.
  Template editing now saves the actual generator configuration; [evidence](docs/REPORTING.md).

- [x] **R03 — Make schedules and delivery restart-safe** · P1 · M2 · Improve · L. Depends: R01, I01.
  Done: schedule timezone/DST, missed-run policy and stable run identity are explicit;
  retries do not create uncontrolled duplicate mail, and overlapping executions are
  bounded. Failed generation and failed delivery are separate statuses.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  durable jobs/cursors, database locks, missed-slot catch-up, worker crash recovery and
  separate SMTP retry/partial-acceptance status in `scripts/test-report-jobs.mjs`. SMTP
  delivery is at least once; see [unattended operation](docs/UNATTENDED_OPERATION.md).
- [x] **R04 — Preserve report revisions and reproducibility** · P1 · M2 · New · M. Depends: H04, R01.
  Done: exports record inputs, window, mapping/calculation revisions and generation time;
  a correction creates a new revision with a reason. Published reports can be reproduced
  or clearly identify why underlying retention prevents full regeneration.
  Completed: immutable digest-bound revisions ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)).
  [PR #67](https://github.com/Sparkz400/performance_dashboard/pull/67) requires a reason for every revision after the first and adds a
  read-only regeneration check that names changed sections and recorded causes (later
  corrections, late data, declarations, plan changes, retention in overlapping hours);
  `reportRevisionCheck.test.ts`, `test-daily-workflows.mjs` with browser.

- [x] **R05 — Enforce distribution and retention boundaries** · P1 · M2 · Improve · M. Depends: R01, F07.
  Done: recipients/downloads are scoped, expired links fail, deleted schedules stop future
  delivery and stored PDFs follow a declared retention policy. Test unauthorized access
  to another report ID and stale links after permission changes.
  Completed: [PR #68](https://github.com/Sparkz400/performance_dashboard/pull/68). Downloads stay administrator-only (no emailed links exist);
  deleting a schedule cancels queued runs and undelivered email; opt-in
  `REPORT_RETENTION_DAYS` removes old PDFs only inside the reports directory and answers
  410 afterwards; a demoted session loses access (`test-report-boundaries.mjs`;
  [reporting](docs/REPORTING.md)).
- [x] **R06 — Add fair period and production comparisons** · P2 · M3 · New · M. Depends: R02, O05.
  Done: compare shifts/jobs/machines with product mix, scheduled time, quality coverage
  and corrections visible; allow energy/maintenance additions only when their inputs
  exist. Do not rank incomparable periods as if differences proved improvement.
  Completed: FR03 in [PR #63](https://github.com/Sparkz400/performance_dashboard/pull/63);
  `scripts/test-period-comparisons.mjs`; [scope](docs/FACTORY_READINESS.md#fair-comparisons).

## Quality and traceability

- [ ] **Q01 — Validate SPC methods and baseline lifecycle** · P1 · M3 · Improve · L. Depends: F02, H01.
  Done: test evaluator reference datasets, sample spacing, minimum sample counts,
  zero variance, missing/bad values and restart behavior; baseline approval/revision
  records the process/product context and never silently trains on a fault period.
  Progress: reviewed SPC reference periods freeze ordered readings with a digest, require
  100 usable readings, positive variation, no rule signals and reviewer attestation, and
  reproduce the NIST reference example ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62),
  [scope](docs/QUALITY_LINE_OPERATIONS.md#reviewed-spc-reference-periods)). Remaining:
  sample-spacing and live-evaluator restart checks against reference datasets.
- [ ] **Q02 — Add appropriate control charts and capability** · P2 · M3 · New · L. Depends: Q01.
  Done: select I-MR, subgroup or attribute charts only for declared data assumptions;
  distinguish specification from control limits. Cp/Cpk or other capability output
  requires a qualified baseline and shows sample size/assumptions instead of false precision.
  Progress: Cp/Cpk use separate specification limits and only an approved reference
  period ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)).
  Remaining: chart-type selection from declared data assumptions.
- [ ] **Q03 — Record inspections, rejects and rework** · P2 · M3 · New · L. Depends: O04, U03.
  Done: inspection plans and defect reasons link to product/job/batch; corrections
  retain history and do not double-count a reworked part as both new output and scrap.
  Manual inspection evidence is visibly distinct from automatic sensor evidence.
  Progress: attributable batch inspections, required defect reasons and owned rework
  closed only by a newer passing inspection ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62),
  [scope](docs/QUALITY_LINE_OPERATIONS.md#batch-quality-and-genealogy)). Recipes/batches
  remain experimental. Remaining: inspection plans linked to product/job outside batches.
- [ ] **Q04 — Harden batch lifecycle and summaries** · P1 · M3 · Improve · M. Depends: O04.
  Done: concurrent starts, transitions, missing data and partial batches have tested
  behavior; summary windows use actual batch boundaries and product context. Start/stop
  buttons clearly describe application records rather than PLC control.
  Progress: frozen batch recipes, `[startedAt, completedAt)` windows and unknown-aware
  good-quality summaries ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)).
  Remaining: confirm concurrent-start and partial-batch fixtures before leaving experimental.
- [ ] **Q05 — Add bounded lot and batch genealogy** · P2 · M3 · New · L. Depends: Q04, Q03.
  Done: input/output lots, splits, merges and affected batches can be traced with stable
  IDs and corrections; export a demonstrable trace query. Scope this to observed records,
  without promising a complete supply-chain or regulated recall system.
  Progress: declared lots, unit/quantity checks, cycle rejection and a bidirectional
  bounded trace report ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)).
  Remaining: correction records for declared lot movements.
- [ ] **Q06 — Compare recipes with observed settings** · P2 · M3 · Improve · L. Depends: Q04, C04.
  Done: approved recipe revisions and tolerances can be compared to read-only measured
  parameters; deviations retain time, quality and context. Recipe edits do not apply
  machine setpoints, and unavailable parameters are not treated as matching.
  Progress: batch parameters compare good-quality observed means with frozen tolerances;
  missing parameters are unknown ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)).
  Remaining: qualification before the experimental recipe module is supported.
- [ ] **Q07 — Strengthen audit records without compliance overclaims** · P1 · M3 · Improve · L. Depends: F07, Q04.
  Done: verify concurrent integrity-chain updates, actor identity, signature purpose,
  correction reasons and exports; document database-admin/tamper boundaries. Keep
  regulatory claims disabled until a separate named validation program establishes them.

## Maintenance and energy

- [ ] **M01 — Add asset history and maintenance records** · P2 · M3 · New · M. Depends: C04, U04.
  Done: interventions, findings and attachments link to the asset and relevant trend/stop;
  an owner can close/reopen the application record with an audit trail. Existing CMMS
  identifiers can be stored without attempting to replace a complete CMMS.
  Progress: attributable append-only service history with incident links
  ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)), alarm-linked
  actions ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)) and CMMS
  handoff identities (I04). Remaining: attachments and direct trend/stop links on records.
- [x] **M02 — Track usage-based maintenance intervals** · P2 · M3 · New · M. Depends: M01, O05.
  Done: runtime/cycle counters support explicit resets and service baselines; due/overdue
  states show missing-data uncertainty. Replacing a component does not erase the parent
  machine's lifetime measurements.
  Completed: [PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59);
  calendar/runtime/cycle plans with snapshotted profiles, partial-observation states and
  service completion that rebaselines without deleting measurements
  (`scripts/test-daily-workflows.mjs`; [contract](docs/DAILY_OPERATIONS.md#maintenance)).
  Components are not modeled separately from machines.
- [ ] **M03 — Build a condition-to-inspection workflow** · P2 · M3 · New · L. Depends: M01, A02, Q01.
  Done: qualified thresholds/trends create reviewable maintenance suggestions linked to
  evidence and outcomes; measure false positives. No claim of predicting remaining life
  is made from an unvalidated threshold or insufficiently sampled vibration signal.
  Progress: alarm-linked actions record recovery/recurrence outcomes after service
  ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)). Remaining:
  false-positive measurement against qualified thresholds.
- [x] **M04 — Add trustworthy energy and utility accounting** · P2 · M3 · New · L. Depends: H01, O05.
  Done: distinguish power from energy, integrate only appropriate samples, handle meter
  resets and units, and report kWh or utility consumption per good unit with coverage.
  Reconcile one meter interval against an independent reading.
  Completed: [PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59);
  cumulative-meter accounting, declared rollover, energy per good part with coverage and
  an independent reconciliation fixture in `scripts/test-daily-workflows.mjs`
  ([contract](docs/DAILY_OPERATIONS.md#energy-and-losses)). Physical meter calibration
  remains a machine-owner check.
- [x] **M05 — Add optional cost and emissions estimates** · P2 · M3 · New · M. Depends: M04.
  Done: user-supplied tariff/currency/emission-factor versions and validity periods are
  explicit; missing factors stop the estimate. Label results as estimates with allocation
  assumptions, not billing-grade measurements or certified emissions statements.
  Completed software: [implementation `019be8e0`](https://github.com/Sparkz400/performance_dashboard/commit/019be8e068e06e3abbb0ab14c472ca58c61d508e);
  [verification and separate qualification boundaries](docs/DATA_INTEGRITY.md#local-checkpoint-validation--2026-10-28).
- [ ] **M06 — Compare idle losses and improvement actions** · P2 · M3 · New · M. Depends: M04, O02.
  Done: correlate consumption with production/idle states, show candidate avoidable usage
  and compare normalized periods after an action. Retain changes in product mix, operating
  hours and meter coverage so correlation is not presented as proof of causation.
  Progress: idle/changeover energy ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59))
  and verified energy differences in fair comparisons (R06). Remaining: linking an
  improvement action to before/after normalized periods.

## Integrations and extension points

- [x] **I01 — Introduce a durable integration outbox** · P1 · M2 · Improve · L. Depends: F03, H01.
  Done: actual application events enter a durable queue with stable IDs, schema versions,
  scoped payloads, retries/backoff and dead-letter inspection; receivers can deduplicate.
  Test process failure around send/ack and keep outbound-request protections intact.
  Completed (wave 2): alarm, health and CMMS events are written to `webhook_deliveries` in the
  producing transaction; bodies carry the stable delivery `id` and `schemaVersion`; 100 failed
  attempts dead-letter with an incident, inspection and audited browser requeue under the same ID.
  `test-integration-outbox.mjs` kills a sender after the receiver got the event and before the
  acknowledgment commits, and proves the identical signed body is resent. Outbound URL checks are unchanged.
- [x] **I02 — Publish a bounded integration API contract** · P1 · M2 · Improve · L. Depends: H01, F07.
  Done: document supported machine/history/job endpoints, errors, scopes, pagination,
  rate limits and version policy; supply runnable examples and contract tests. Align
  REST/tRPC ownership without rewriting working callers solely for architectural symmetry.
  Completed (wave 2): [integration contract](docs/INTEGRATION_API.md) for assets, hourly summaries,
  raw replay and work-order completions, with one error shape, grants, time-window paging, rate-limit
  headers and an additive-only v1 policy; tRPC stays browser-internal. `test-api-contract.mjs` runs the
  published `scripts/examples/integration-client.mjs`. The unmounted, stale Swagger draft was removed.
  Non-human tokens remain E02.
- [x] **I03 — Provide one ERP work-order exchange** · P2 · M2 · New · L. Depends: I02, O04.
  Done: import a sanitized order/product contract with preview, external IDs, idempotency
  and rejection reporting; export completion facts without silently editing ERP records.
  A named pilot validates field meanings before a vendor-specific connector is promised.
  Completed: vendor-neutral file exchange in [PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64);
  `scripts/test-work-orders.mjs`; [scope](docs/FACTORY_OPERATIONS.md#reviewed-work-order-exchange).
  No vendor connector is promised until a named pilot validates field meanings.
- [x] **I04 — Provide a CMMS handoff contract** · P2 · M3 · New · M. Depends: I01, M01.
  Done: a maintenance suggestion can be exported or explicitly submitted to a configured
  destination with asset/event identity and delivery status; duplicate delivery cannot
  create uncontrolled duplicate work orders. Keep review and remote-write permissions explicit.
  Completed software: [implementation `019be8e0`](https://github.com/Sparkz400/performance_dashboard/commit/019be8e068e06e3abbb0ab14c472ca58c61d508e);
  [verification and separate qualification boundaries](docs/DATA_INTEGRITY.md#local-checkpoint-validation--2026-10-28).
- [x] **I05 — Support portable configuration bundles** · P1 · M2 · Improve · M. Depends: C04, F07.
  Done: bundle dashboards, mappings, rules and relevant revisions with schema version,
  secret exclusion, conflict preview and rollback; imports cannot overwrite unrelated
  configuration silently. Cross-version import and invalid-file cases have fixtures.
  Completed: [PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64);
  `scripts/test-configuration-bundles.mjs`; [scope](docs/FACTORY_OPERATIONS.md#reusable-setup).
- **I06 — Withdrawn:** TIA MCP is a separate product. No integration is planned.
- [ ] **I07 — Qualify the custom-widget runtime** · P3 · M5 · Improve · L. Depends: F07, U06.
  Done: prove actual rendering, iframe isolation, origin-checked messaging, permissions,
  versioning and removal; a malicious test widget cannot access unrelated data or parent
  credentials. Do not call manifest registration alone a working widget SDK.
- [x] **I08 — Evaluate connector packaging for contributors** · P3 · M5 · Research · M. Depends: C10, I02.
  Done: use lessons from two real adapters to choose a minimal extension interface,
  fixture contract and compatibility policy. Prefer existing module patterns; do not
  introduce dynamic server-code loading or a marketplace without a concrete need.
  Closed 2026-10-29: REJECTED packaging: connectors join as read-only OPC UA servers ([contributing](CONTRIBUTING.md#adding-a-connector)). Reopen if a source cannot be carried faithfully by OPC UA, such as Sparkplug session state. [decision](docs/RESEARCH_DECISIONS.md#i08--evaluate-connector-packaging-for-contributors).

## Deployment and operation

- [x] **D01 — Document and verify the OT deployment boundary** · P0 · M0 · Improve · M. Depends: F07.
  Done: diagrams name acquisition, database, web and optional outbound paths; least-privilege
  identities, TLS termination, firewall assumptions and metrics exposure are verified in
  an isolated deployment. No open internet access to a PLC is required by the design.
  Completed: [PR #66](https://github.com/Sparkz400/performance_dashboard/pull/66); new installations and restores run the app as a
  non-superuser database owner with a separate bootstrap superuser; `test-operations.mjs`
  verifies the role, refuses `COPY … TO PROGRAM`, and still passes install, restore,
  earlier-image upgrade and rollback. Loopback publishing, internal database network,
  UID 1000 and admin-only metrics are verified; site TLS/firewall settings remain
  installation checks. [Boundary and diagram](docs/SECURITY_BOUNDARIES.md#ot-deployment-boundary-d01).
- [x] **D02 — Implement a complete backup and restore procedure** · P0 · M0 · New · L. Depends: H01.
  Done: cover PostgreSQL, configuration, required spool state, certificates and secret
  recovery with protected storage; restore into an isolated fresh installation and
  reconcile data. Dashboard-only export remains clearly labeled as configuration export.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  complete stopped-app backups and isolated fresh restores preserve database, encrypted
  identities/key, pending spool, PKI and PDFs; browser recovery, tamper and overwrite
  checks in `scripts/test-operations.mjs`; [operations](docs/OPERATIONS.md). Customer
  restore drills remain part of D06.
- [x] **D03 — Make upgrades and rollback operationally safe** · P0 · M0 · Improve · L. Depends: D02.
  Done: migrations are tested on a copy of the previous schema/data, compatibility is
  declared, and backup/rollback behavior is documented. Failed startup cannot leave a
  silently half-migrated collector writing incompatible measurements.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  the earlier-image upgrade preserves data, takes a verified checkpoint, stops on failed
  startup and restores the checkpoint into a fresh instance (`scripts/test-operations.mjs`;
  [acceptance](docs/FACTORY_PILOT_ACCEPTANCE.md#local-validation)).
- [ ] **D04 — Measure the supported operating envelope** · P1 · M1 · New · L. Depends: F06, H02.
  Done: benchmark named hardware at declared tag rates, database size, dashboard users
  and export load; publish ingestion lag, p95 queries, memory, CPU and bytes/sample.
  Include replay competing with live acquisition, then choose limits from evidence.
  Progress: docs/CAPACITY.md records a 6,200-row synthetic replay/live/query/export
  workload on named hardware. A sustained customer/PLC operating envelope remains open.
- [x] **D05 — Make health and diagnostics actionable** · P1 · M1 · Improve · M. Depends: D01, H03.
  Done: readiness distinguishes accepting requests from collecting/persisting data;
  metrics cover reconnects, spool age, failed jobs and database lag. A redacted support
  bundle excludes secrets and has explicit size/time bounds.
  Progress: database readiness, receive age/storage reserve and a bounded redacted
  support download are implemented. Browser export checks pass; failed-job diagnostics
  include durable report generation/delivery attempt and retry state.
  Connection diagnostics show reconnects in the UI (C09).
  Completed: [PR #67](https://github.com/Sparkz400/performance_dashboard/pull/67) adds admin-only Prometheus gauges for reconnects and losses,
  spool backlog and age, per-machine last commit age, database round trip and background
  job states; unknown values are NaN or absent, never zero (`operationalMetrics.test.ts`,
  real-database scrape in `test-access.mjs`). Metrics are listed in [operations](docs/OPERATIONS.md).
- [ ] **D06 — Complete the first pilot acceptance pack** · P1 · M1 · New · L. Depends: D02, D04, D05, O09, R01, C04.
  Done: record exact machines/settings/software, supervised shift reconciliation,
  interruptions, restore evidence, observed defects and unresolved limits; the process
  owner accepts the bounded pilot. Automation alone cannot close this item.
- [ ] **D07 — Support a documented disconnected installation** · P2 · M2 · New · M. Depends: D03.
  Done: installation/update artifacts, dependencies, image digests and instructions work
  without runtime internet access; disabled external email/report destinations fail
  clearly. License notices and dependency inventory accompany the package.
  Progress: hashed offline image packages and fresh offline installation
  ([PR #62](https://github.com/Sparkz400/performance_dashboard/pull/62)); signed release
  envelopes with SBOM and license inventory ([PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64)).
  Remaining: an offline update rehearsal and a check that unreachable mail/report
  destinations fail clearly without internet access.
- [ ] **D08 — Design high availability from measured needs** · P2 · M4 · Research · XL. Depends: D04, H08, E03.
  Done: distinguish database recovery, web redundancy and collector ownership; demonstrate
  fencing against two active collectors and test failover on a declared topology.
  Defer implementation if the pilot's recovery targets are met by simpler operation.
  Decision 2026-10-29: DEFER until agreed RPO/RTO are missed by the D06 restore drill. The startup collector lock is built (wave 2, `test-collector-lock.mjs`); fencing stays with this item. [decision](docs/RESEARCH_DECISIONS.md#d08--design-high-availability-from-measured-needs).

## Enterprise and multi-site

- [x] **E01 — Enforce site and asset permissions consistently** · P1 · M2 · Improve · L. Depends: F07.
  Done: server-side checks cover history, live subscriptions, reports, exports, rules and
  background jobs for at least two sites; changing permissions invalidates stale access.
  UI filtering alone never qualifies the boundary.
  Completed: two-site REST/tRPC/CSV/live-room checks and revocation
  ([PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)), the F07 matrix
  ([PR #66](https://github.com/Sparkz400/performance_dashboard/pull/66)) and [PR #68](https://github.com/Sparkz400/performance_dashboard/pull/68)
  per-site alarm-rule reads on REST and tRPC. Reports are administrator-only; background
  jobs deliver only to administrator-configured destinations
  ([boundary](docs/SECURITY_BOUNDARIES.md#access-matrix-f07)).
- [ ] **E02 — Add federated identity and service-account scopes** · P2 · M4 · New · L. Depends: E01.
  Done: a selected OIDC provider, session revocation and least-privilege machine accounts
  pass positive/negative tests; delegated MFA follows the identity provider policy.
  Document a controlled recovery path without an unrestricted hidden admin bypass.
  Decision 2026-10-29: DEFER until customer IT names an IdP or an integration needs non-human API access. [decision](docs/RESEARCH_DECISIONS.md#e02--federated-identity-oidc-and-service-account-scopes).
- [ ] **E03 — Provide an honest multi-site overview** · P2 · M4 · New · L. Depends: H08, E01.
  Done: site availability, last successful sync, data coverage and comparable definitions
  are visible; an offline site cannot appear as zero production or current live data.
  Test site-local continuity through a central outage.
- [ ] **E04 — Manage edge-node lifecycle and configuration** · P2 · M4 · New · L. Depends: E03, I05.
  Done: enrollment, credential rotation/revocation, config revision and staged upgrades
  are attributable; an edge can reject incompatible configuration. Fleet updates have
  a documented stop/rollback path and do not issue machine commands.
- [ ] **E05 — Define data ownership, residency and retention policies** · P2 · M4 · New · M. Depends: E01, H05.
  Done: deployment operators can identify stored/exported data and optional external
  flows; export, deletion, retention and access review have explicit scope and audit
  records. Do not claim jurisdictional compliance from settings alone.
- [x] **E06 — Decide whether separate-company tenancy is justified** · P3 · M5 · Research · XL. Depends: E02, E03, E05.
  Done: compare separate installations with a hosted tenancy design using real demand,
  costs and threat boundaries; require independent isolation testing before implementation
  is accepted. Continue separate-company deployments unless the gate is explicitly passed.
  Closed 2026-10-29: REJECTED hosted tenancy: separate installations continue. Reopen when a named organization needs hosted multi-company service, separate-install cost exceeds hosting, E02/E05 are done and isolation testing is budgeted. [decision](docs/RESEARCH_DECISIONS.md#e06--decide-whether-separate-company-tenancy-is-justified).

## Analytics and experiments

- [x] **X02 — Evaluate anomaly and predictive-maintenance models** · P3 · M5 · Research · XL. Depends: Q01, M03, H07.
  Done: compare against a simple threshold baseline on held-out periods/assets with
  labeled incidents; publish false-positive, missed-event and lead-time behavior plus
  drift monitoring. Reject the feature if labels or operational value are insufficient.
  Closed 2026-10-29: REJECTED: no labeled incidents exist, as the Done text requires. Reopen with labeled failure modes across assets, a held-out period and a threshold baseline in production. [decision](docs/RESEARCH_DECISIONS.md#x02--evaluate-anomaly-and-predictive-maintenance-models).
- [x] **X03 — Add incident replay and diagnostic correlation** · P2 · M3 · New · L. Depends: H07, A01.
  Done: replay a bounded historical window with signal quality, events, changes and
  annotations in time order; separate source/receive clocks and missing intervals.
  Correlated signals are presented as investigation leads, not proven causes.
  Completed: [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57);
  bounded replay, playback cursor, raw quality/clocks, immutable operator revisions,
  later stop annotations and export in `incidentReplay.test.ts` and
  `scripts/test-incident-replay.mjs`; [contract](docs/INCIDENT_REPLAY.md).
- [ ] **X04 — Prototype bounded capacity and completion forecasts** · P3 · M5 · Research · L. Depends: O05, R06.
  Done: estimate using comparable jobs and recent capacity with uncertainty ranges;
  backtest against actual completion and disclose unsupported process changes. Forecasts
  are advisory and do not automatically reschedule or control machines.
  Decision 2026-10-29: DEFER until the pilot records about 20 comparable completed runs to backtest. [decision](docs/RESEARCH_DECISIONS.md#x04--prototype-bounded-capacity-and-completion-forecasts).
- [ ] **X06 — Test improvement recommendations with evidence** · P3 · M5 · Research · M. Depends: X03, R06, M06.
  Done: recommendations cite loss/energy/maintenance evidence and assumptions, allow
  human dismissal and link accepted actions to outcomes. Compare usefulness with a
  simple ranked loss list; recommendations use explicit rules and measured evidence.
  Decision 2026-10-29: DEFER until a P06 review shows the ranked loss list is seen but not acted on, and M06 links an action to before/after periods. [decision](docs/RESEARCH_DECISIONS.md#x06--test-improvement-recommendations-with-evidence).

## Public project and pilot learning

- [ ] **P01 — Validate the first customer and machine use case** · P1 · M0 · Research · M. Depends: none.
  Done: document interviews/observation with an operator, engineer and production lead,
  a nominated line, actual protocols, current reporting effort and the first improvement
  question. Until available, retain these as explicit hypotheses and a simulator-only scope.
  Decision 2026-10-29: Interview guide and hypotheses H1–H6 are ready; needs an operator, an engineer and a production lead. [decision](docs/RESEARCH_DECISIONS.md#p01--validate-the-first-customer-and-machine-use-case).
- [x] **P02 — Build a realistic, repeatable demonstration** · P1 · M1 · Improve · M. Depends: O04, O05, A01.
  Done: owned simulator scenarios include run/stop, counts/rejects, job changes, bad quality,
  reset and outage/replay; a scripted walkthrough yields known results. Mark all demo
  screenshots/data synthetic and avoid implying real-machine qualification.
  Completed: [PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64);
  `node scripts/demo-factory.mjs` produces a hashed synthetic walkthrough with a known
  43.33% reconciled OEE; [scope](docs/FACTORY_OPERATIONS.md#repeatable-demonstration).
- [ ] **P03 — Publish useful community examples and wiki navigation** · P1 · M2 · Improve · S. Depends: P02.
  Done: initialize/verify the GitHub wiki publication path if still needed, keep its source
  in docs/wiki, and provide sanitized mapping/dashboard/report examples with expected
  outputs. Accept contributions without uploading customer data or machine credentials.
- [ ] **P04 — Establish evidence-backed versioned releases** · P1 · M2 · Improve · M. Depends: D03, F10.
  Done: a release identifies commit/image digest, changelog, migrations, compatibility,
  SBOM/dependency notices and checks for that exact revision; package signatures/provenance
  are verified. A release label does not erase open physical/security acceptance limits.
  Progress: signed release envelopes with digests, migrations, SBOM, license inventory
  and evidence verification ([PR #64](https://github.com/Sparkz400/performance_dashboard/pull/64),
  [scope](docs/FACTORY_OPERATIONS.md#versioned-offline-release-candidates)). Blockers:
  a production publisher key held outside the repository and F10 closure.
- [ ] **P05 — Make focused contributions easier** · P2 · M2 · Improve · S. Depends: F10.
  Done: label small tasks by subsystem and expected evidence, document connector/widget
  boundaries and add fixtures useful to reviewers. Maintain existing public-repo policies
  instead of adding redundant workflows or unmaintained template files.
- [ ] **P06 — Review product usefulness after each pilot milestone** · P1 · M1 · Research · M. Depends: D06, P01.
  Done: compare commissioning effort, report preparation time, unresolved stop reasons
  and user-observed usefulness against the agreed baseline; reorder or remove backlog
  items accordingly. Record qualitative evidence when reliable quantitative data is absent.
  Decision 2026-10-29: Baseline measures and review protocol are ready; needs P01 and the D06 pilot. [decision](docs/RESEARCH_DECISIONS.md#p06--review-product-usefulness-after-each-pilot-milestone).

## Completion policy

For every completed item, append `Evidence: <PR/commit and validation reference>`.
Record any explicit scope reduction beside it. An item waiting for real hardware,
customer feedback or independent acceptance stays open with its concrete blocker;
do not substitute mock evidence. Update [STATUS](docs/STATUS.md), compatibility,
research and the wiki when support claims actually change.
