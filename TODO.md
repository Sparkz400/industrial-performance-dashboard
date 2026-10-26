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

The first P0 wave implements and tests F02/F04/F05/H01/H02 in
[PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40). Validation and
scope are recorded in [P0 acceptance](docs/P0_ACCEPTANCE.md).
F01/F09/F10/H03 have partial progress and remain open. The next functional slice
is F03/A01 (one real alarm-to-delivery path), followed by F06/F07/F08 and endpoint trust.

All 29 dependency PRs were reviewed. Fifteen obsolete or incompatible proposals
were closed with reasons; fourteen compatible proposals are consolidated into this
wave in [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40), whose
status records integration. See [PR dispositions](docs/DEPENDENCY_REVIEW.md).

## Foundation

- [ ] **F01 — Capture the current product contract** · P0 · M0 · Improve · S. Depends: none.
  Done: preserve fixtures for trend truncation, same-key machines, unwired alerts/webhooks,
  edge receive and empty AI results; map enabled screens to supported, experimental or
  disabled states and link each reproduced issue to its owning task.
  Progress: trend/machine-isolation, edge and AI regressions plus the acceptance
  matrix are present; alarm/webhook contract fixtures remain open.
- [x] **F02 — Isolate SPC state and baselines** · P0 · M0 · Improve · M. Depends: F01, H01.
  Done: machine/tag/profile identities isolate baselines and rolling windows; two machines
  with identical keys and multiple profiles cannot contaminate or double-count samples.
  Keep SPC explicitly experimental until Q01/Q02 qualify its statistics.
  Completed: [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40);
  [validation and limits](docs/P0_ACCEPTANCE.md).
- [ ] **F03 — Prove a real alert-to-delivery path** · P0 · M0 · Improve · M. Depends: F01.
  Done: trace a simulator event through the UI-created rule, evaluator, persisted history
  and configured delivery; identify one supported engine, and disable or migrate unwired
  alternatives. Verify real event wiring separately from webhook test delivery.
- [x] **F04 — Make edge status honest** · P0 · M0 · Improve · S. Depends: F01.
  Done: UI/API/docs distinguish queued, transferred and queryable-in-history states;
  unfinished central ingestion is disabled or labeled experimental; reconnect/retry
  cannot be presented as proof that a central historian contains the measurements.
  Completed: [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40);
  [validation and limits](docs/P0_ACCEPTANCE.md).
- [x] **F05 — Make AI data access and limitations explicit** · P0 · M0 · Improve · S. Depends: F01.
  Done: users see whether an answer used measured data or only generated a suggestion;
  external-provider use is disclosed, unavailable configuration is clear, and unexecuted
  SQL cannot appear as a verified result. No arbitrary SQL execution is added.
  Completed: [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40);
  [validation and limits](docs/P0_ACCEPTANCE.md).
- [ ] **F06 — Qualify durable acquisition failures** · P0 · M0 · Improve · L. Depends: H01.
  Done: test process termination, database outage, spool reopen, disk-full and replay
  interruption; account for every durably accepted event and expose unreceived/unknown
  intervals. Define behavior before storage exhaustion rather than silently dropping data.
- [ ] **F07 — Audit every data-access boundary** · P0 · M0 · Improve · L. Depends: F01.
  Done: negative tests cover admin/viewer, REST, tRPC, sockets, reports, shares and exports;
  machine identifiers cannot bypass authorization. Document one-company deployment
  limits and close any unintended access found before accepting the affected feature.
  Progress: socket middleware now reuses one session parser and the validated secret;
  a real socket regression covers unsigned rejection, signed acceptance and stable
  session-store listener counts. The broader authorization/expiry audit is still open.
- [ ] **F08 — Constrain public shares and embeds** · P0 · M0 · Improve · M. Depends: F07.
  Done: revocation/expiry work for page, API and live updates; shared views reveal only
  selected data, have explicit lifetime and embedding rules, and exclude administrative
  metadata. Expired sessions/shares stop receiving newly streamed data.
- [ ] **F09 — Resolve security findings against the actual release** · P0 · M0 · Improve · M. Depends: F01.
  Done: review dependency, container and code-scanning reports for the exact commit/image;
  fix actionable findings or record scope, mitigation and owner for accepted residual
  risk. Test outbound URLs, uploads, SVG, CSRF and secrets handling at their boundaries.
  Progress: [dependency review](docs/DEPENDENCY_REVIEW.md), clean root install and
  peer validation; runtime audit zero, seven moderate development-package findings.
  Follow-up: qualify coordinated MUI, Storybook/Vite, lint, Vitest 5, virtualization,
  grid-layout and Node major migrations; resolve development advisories with supported
  upstream versions. Exact-image/code-scanning review and the full boundary audit remain open.
- [ ] **F10 — Create a feature-level acceptance matrix** · P0 · M0 · Improve · M. Depends: F02, F03, F06, F07.
  Done: enabled pilot features have happy-path and failure-path evidence; distinguish
  unit, database, browser, simulator and physical-machine checks. CI success alone never
  promotes an experimental module or a new machine family to supported status. Resolve
  test-harness deprecation warnings, including nested mock declarations, before upgrades;
  investigate the first-route timeouts observed in the parallel 2026-10-26 test run.
  Progress: top-level mocks and separate app-bootstrap budget resolve the observed
  harness issues; [feature evidence](docs/P0_ACCEPTANCE.md) names remaining negative tests.

## Connectivity

- [ ] **C01 — Support protected OPC UA user identities** · P0 · M0 · Improve · L. Depends: F09.
  Done: username/password and user-certificate identity paths are explicitly supported
  or scoped per endpoint, secrets are protected/redacted, rotation works, and wrong
  credentials fail clearly. Qualify with read-only permissions on owned test servers.
- [ ] **C02 — Complete certificate and endpoint trust lifecycle** · P0 · M0 · Improve · M. Depends: C01.
  Done: expiry, rejected peers, identity/hostname mismatch and renewal have actionable
  diagnostics; trust requires an explicit decision. Test an expired certificate and
  a changed endpoint without silently downgrading channel security.
- [ ] **C03 — Add a commissioning preflight** · P1 · M1 · New · M. Depends: C01, H01.
  Done: a guided check reports connection, identity, trust, browse/read permission,
  source time and sample quality; users can save a redacted diagnostic report without
  scanning arbitrary networks or issuing machine writes.
- [ ] **C04 — Build reusable, versioned machine profiles** · P1 · M1 · New · L. Depends: C03.
  Done: profiles include namespace-aware signals, types, units, scales, state meanings,
  counters and supported endpoint versions; import previews differences and requires
  review. A second simulator instance can be commissioned without source edits.
- [ ] **C05 — Define a connector contract and gateway recipes** · P1 · M2 · New · L. Depends: C04, H01.
  Done: normalize source identity, quality, timestamps and reconnect behavior; demonstrate
  one actual legacy-device gateway path and document costs/prerequisites. Use an approved
  gateway before adding a native driver unless the pilot establishes a clear need.
- [ ] **C06 — Add MQTT ingestion and evaluate Sparkplug** · P2 · M2 · New · XL. Depends: C05.
  Done: authenticated TLS, topic authorization, mapping validation and duplicate/out-of-order
  fixtures pass. If Sparkplug is selected, qualify birth/death, rebirth, session and metric
  identity; broker delivery guarantees are not advertised as end-to-end exactly-once history.
- [ ] **C07 — Select one brownfield protocol extension** · P2 · M2 · Research · L. Depends: C05.
  Done: rank Modbus TCP/RTU, MTConnect and vendor gateways against the pilot inventory;
  implement at most the selected initial adapter with fixtures for byte order, scaling,
  unavailable values or sequence reset as applicable, and document unsupported devices.
- [ ] **C08 — Suggest mappings from OPC UA information models** · P2 · M3 · New · L. Depends: C04.
  Done: detect declared Machinery/selected companion-model capabilities using namespace
  URIs and type information; show suggestions with provenance and confidence, require
  approval, and fall back cleanly when a server only exposes proprietary tags.
- [ ] **C09 — Expose subscription limits and diagnostics** · P1 · M2 · Improve · M. Depends: C01, H01.
  Done: requested/revised sampling, queue sizes, rejected items, reconnects and late/stale
  data are visible; load tests avoid reconnect storms and reveal overflow risk. Limits
  are configurable per endpoint and never assumed identical across machines.
- [ ] **C10 — Publish a connector qualification harness** · P1 · M2 · New · L. Depends: C05.
  Done: each enabled adapter replays disconnect, duplicate, bad-quality, type-change and
  timestamp fixtures; a compatibility entry names vendor/model/firmware/server, mappings,
  software commit and outstanding limits. Simulator success is listed separately.

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
- [ ] **H03 — Carry coverage and quality into every view** · P0 · M0 · Improve · M. Depends: H02.
  Done: trend, tooltip, KPI and report contracts distinguish bad quality, missing samples,
  stale values and valid zero; source/receive times and known gaps remain inspectable.
  Continuous interpolation across an unknown interval is never implied without disclosure.
  Progress: trends preserve zero/null, report whole-window statistics and disclose
  sampled/unknown continuity; KPI and tooltip consistency across all views remains open.
- [ ] **H04 — Stream and bound historical exports** · P1 · M2 · Improve · M. Depends: H01.
  Done: large exports use bounded memory, cancellation and query limits, retain identity,
  units, timestamps and quality, and clearly label raw versus aggregated output. Protect
  spreadsheet consumers from formula injection and test partial/failing downloads.
- [ ] **H05 — Introduce an explicit retention policy** · P1 · M2 · New · L. Depends: D04, H04.
  Done: preview storage impact and exact deletion scope, preserve required evidence,
  schedule bounded cleanup and verify backup/restore interactions. No historical data
  is deleted by default merely because a new version was installed.
- [ ] **H06 — Add quality-aware rollups and query tuning** · P1 · M2 · Improve · L. Depends: H05, H02.
  Done: benchmark existing indexes first; implement only justified indexes/partitioning
  and rollups retaining count, extrema and quality coverage. Compare raw/aggregate results
  and preserve state durations and counter semantics instead of averaging every tag.
- [ ] **H07 — Handle late and corrected measurements predictably** · P1 · M2 · New · L. Depends: H01.
  Done: event-time ordering, duplicate identities and late arrivals have a defined policy;
  affected aggregates are recomputed with provenance and finalized reports keep their
  original revision. Test out-of-order timestamps and invalid/future clock readings.
- [ ] **H08 — Complete authenticated edge-to-central history** · P2 · M4 · Improve · XL. Depends: F04, H01, I01, E01.
  Done: edge identity and allowed schemas are checked; receiver writes canonical records
  transactionally and acknowledges committed identities. Resume after lost responses,
  partial batches and process crashes without duplicates or silent loss; revoke a node.
- [ ] **H09 — Provide spool and storage capacity controls** · P1 · M2 · Improve · M. Depends: D04, H04.
  Done: operators see backlog age/bytes, disk runway, write failures and recovery rate;
  export/quarantine recovery has audit evidence. Define backpressure and alert thresholds
  using measured capacity, while preserving all acknowledged records within that boundary.
- [ ] **H10 — Add reusable derived signals safely** · P2 · M3 · New · L. Depends: H02, H04.
  Done: a bounded expression model supports units, quality propagation and versioning;
  no arbitrary server code executes. Test division by zero, incompatible units, missing
  inputs and replay reproducibility before using a derived value in production KPIs.

## Production and OEE

- [ ] **O01 — Make shifts and calendars first-class** · P1 · M1 · New · L. Depends: H01.
  Done: site timezone, overnight shifts, breaks, holidays and DST transitions produce
  explicit planned-production windows; no double-counting at boundaries. Explain the
  difference between scheduled time, observed time and missing coverage.
- [ ] **O02 — Add structured downtime reasons and corrections** · P1 · M1 · New · L. Depends: O01.
  Done: detected stops can be categorized, split or corrected with actor/reason/history;
  planned/unplanned/unknown are distinct, overlaps are rejected, and corrected results
  can be reproduced without destroying the original machine timeline.
- [ ] **O03 — Make OEE explainable down to its inputs** · P1 · M1 · Improve · M. Depends: O02.
  Done: drill from availability/performance/quality to mapped signals, production window,
  excluded periods and counts; identify suspicious values above 100% without silently
  clamping them. Show missing prerequisites and the calculation revision.
- [ ] **O04 — Add product and work-order context** · P1 · M1 · New · L. Depends: O01, C04.
  Done: jobs have stable IDs, product, target quantity, ideal cycle and effective periods;
  selecting a job does not write to the machine. Product changes preserve historical
  context and prevent current standards from silently altering older OEE results.
- [ ] **O05 — Qualify counters, rejects and manual quantities** · P1 · M1 · Improve · L. Depends: O04.
  Done: support explicit reset/rollover policies, counter width and discontinuities;
  manual entries are timestamped deltas or declared snapshots with correction history.
  Tests prevent duplicated totals, negative production and inferred perfect quality.
- [ ] **O06 — Measure setup and changeover loss** · P2 · M3 · New · M. Depends: O04, O02.
  Done: expected/actual changeover periods use product transitions and operator-confirmed
  context; overlapping runs and unobserved transitions remain visible. Compare comparable
  changeovers rather than ranking unrelated jobs or operators.
- [ ] **O07 — Analyze microstops and cycle distributions** · P2 · M3 · New · L. Depends: O02.
  Done: configurable thresholds distinguish short stops and slow cycles; histograms,
  percentiles and loss Pareto preserve acquisition-resolution limits. A 1 Hz sample
  stream must not claim precise detection of sub-second events.
- [ ] **O08 — Add line topology and bottleneck analysis** · P2 · M3 · New · XL. Depends: O07, O05.
  Done: model buffers, blocked/starved states and selected serial/parallel paths; compare
  against a known line scenario. Report candidate constraints and uncertainty rather
  than equating correlated downtime with proven root cause.
- [ ] **O09 — Reconcile a shift against independent evidence** · P1 · M1 · Improve · M. Depends: O01, O04.
  Done: a reconciliation view compares source counters, accepted good/reject quantities,
  operator adjustments and planned/observed time; unresolved differences are explicit
  and prevent a report from being labeled verified.
- [ ] **O10 — Support machines with limited automatic data** · P2 · M2 · New · M. Depends: O02, U06.
  Done: authorized manual counts/state intervals and approved sensor/gateway signals can
  support a bounded workflow; provenance and coverage distinguish manual from automatic
  evidence. Users cannot manufacture a complete OEE number from missing inputs.

## User experience

- [ ] **U01 — Guide the first machine-to-dashboard journey** · P1 · M1 · New · L. Depends: C03.
  Done: endpoint, signal selection, meaning, preview and dashboard creation form one
  recoverable flow; a new user finishes the owned simulator setup without source edits.
  Failed steps explain the relevant permission, certificate or mapping issue.
- [ ] **U02 — Unify freshness, loading and failure states** · P1 · M1 · Improve · M. Depends: H02.
  Done: widgets consistently show last measurement, connection state, missing coverage
  and empty/error states; stale data cannot resemble a live healthy machine. Verify
  small-screen and wall-display readability with real rendered examples.
- [ ] **U03 — Create a focused operator workspace** · P1 · M1 · New · L. Depends: O02, O04.
  Done: an operator sees the current job, stops needing reasons, authorized quality input
  and handover actions in a short touch-friendly flow. Acknowledgment and classification
  are application actions; machine control is not introduced.
- [ ] **U04 — Add shift handover notes and action ownership** · P1 · M1 · New · M. Depends: U03.
  Done: notes link to machine/job/interval, have an owner and resolved/open state, and
  appear in the next handover. Edits are attributable; attachments, if enabled, are
  size/type constrained and permission checked.
- [ ] **U05 — Deliver a useful supervisor wallboard** · P1 · M1 · Improve · M. Depends: U02.
  Done: a selected line shows state, target progress, prioritized issues and freshness;
  kiosk rotation reconnects cleanly and uses a restricted identity. Screens remain
  legible at the agreed viewing distance and do not depend on color alone.
- [ ] **U06 — Establish accessible interaction patterns** · P1 · M1 · Improve · L. Depends: none.
  Done: commissioning, login, dashboards and operator actions support keyboard focus,
  non-drag alternatives, semantic labels and screen-reader status; test contrast, zoom,
  reduced motion and touch targets against an explicit WCAG 2.2 acceptance checklist.
- [ ] **U07 — Improve navigation, localization and display units** · P1 · M1 · Improve · M. Depends: U02, F07.
  Done: role-appropriate navigation, machine search and saved filters reduce clutter;
  English/German, dates, decimal formats and display units follow a declared locale.
  Stored measurement units remain unchanged by display preferences.
- [ ] **U08 — Turn the SVG twin into a practical asset view** · P2 · M3 · Improve · L. Depends: U02.
  Done: templates bind verified signals, stale/bad quality is visible, and users can
  navigate from a component to history and maintenance context. Sanitized content cannot
  escape its boundary; describe this as visualization, not a physics simulation.
- [ ] **U09 — Define a safe offline operator mode** · P2 · M3 · New · L. Depends: U03, I01.
  Done: cached data is explicitly stale, logout clears protected local material, and
  queued application edits have stable identities, conflict review and expiry. A reconnect
  does not duplicate notes/counts or imply machine actions occurred while offline.
- [ ] **U10 — Reduce dashboard loading and rendering cost** · P1 · M2 · Improve · M. Depends: U02, D04.
  Done: measure startup, navigation, memory and live-update behavior on an ordinary
  operator device; reduce large dashboard bundles and unnecessary renders where profiles
  justify it. Preserve accessible loading states and compare results on the same workload.

## Alerts

- [ ] **A01 — Consolidate the alarm and alert lifecycle** · P0 · M0 · Improve · L. Depends: F03, H01.
  Done: one documented rule/event model connects configuration, evaluation, history and
  subscriptions; migrate existing rules without duplicate notifications. Active, cleared,
  acknowledged and unknown states have consistent semantics across API and UI.
- [ ] **A02 — Add debounce, hysteresis and minimum duration** · P1 · M1 · Improve · M. Depends: A01.
  Done: noisy thresholds do not flood history; boundaries and clear conditions are
  documented and replay-tested. Bad/stale input suspends or changes evaluation explicitly
  instead of producing a false recovery.
- [ ] **A03 — Alert on data and collector health** · P1 · M1 · New · M. Depends: A01, H03.
  Done: users can distinguish machine-condition alarms from disconnected endpoint,
  stale signal, bad quality and growing backlog; simulate each condition and verify
  recovery behavior without inventing machine state.
- [ ] **A04 — Add ownership, acknowledgment and maintenance suppression** · P1 · M1 · Improve · M. Depends: A01.
  Done: acknowledgment records actor/time/comment, suppression is scoped and time-bounded,
  and expiration is visible. A dashboard acknowledgment never silently acknowledges
  or clears an alarm in the PLC.
- [ ] **A05 — Deliver escalation and notification policies** · P2 · M2 · New · L. Depends: A04, I01.
  Done: email/webhook destinations have testable routing, quiet hours, escalation and
  durable retry state; credentials are protected and delivery failure is visible.
  Test restarts and a receiver outage without uncontrolled notification floods.
- [ ] **A06 — Measure alert usefulness and flood behavior** · P2 · M2 · New · M. Depends: A04.
  Done: show repeated/chattering alarms, acknowledgment delays and muted items; distinguish
  operator response time from delivery delay. Tune thresholds against replayed incidents
  and keep actionable history rather than deleting inconvenient events.
- [ ] **A07 — Evaluate OPC UA Alarms and Conditions ingestion** · P2 · M3 · Research · L. Depends: A01, C02.
  Done: demonstrate supported event fields, conditions, reconnect refresh and severity
  mapping with an owned server; preserve source event identity. Read-only observation is
  the default; PLC-side acknowledgment remains outside this task.
- [ ] **A08 — Preserve alert evaluation across restarts** · P1 · M2 · Improve · M. Depends: A01, H01.
  Done: cooldown/window state has a documented rebuild/persistence policy; restart and
  historical replay cannot silently suppress a new incident or resend every old one.
  Event time and evaluation time remain distinguishable.

## Reporting

- [ ] **R01 — Produce a reconciled shift report** · P1 · M1 · Improve · L. Depends: O01, O02, O04.
  Done: report planned time, quantities, loss reasons, OEE inputs and coverage for the
  exact shift/product scope; match the dashboard and independent fixture. Missing data
  and unresolved reconciliation prevent an unqualified verified label.
- [ ] **R02 — Make reports useful for daily decisions** · P1 · M1 · Improve · M. Depends: R01, U02.
  Done: include the largest losses, unresolved actions, data freshness and drill-through
  references with readable PDF/print layouts. Review a real rendered report; formatting
  must not hide incomplete data or change numeric precision silently.
- [ ] **R03 — Make schedules and delivery restart-safe** · P1 · M2 · Improve · L. Depends: R01, I01.
  Done: schedule timezone/DST, missed-run policy and stable run identity are explicit;
  retries do not create uncontrolled duplicate mail, and overlapping executions are
  bounded. Failed generation and failed delivery are separate statuses.
- [ ] **R04 — Preserve report revisions and reproducibility** · P1 · M2 · New · M. Depends: H04, R01.
  Done: exports record inputs, window, mapping/calculation revisions and generation time;
  a correction creates a new revision with a reason. Published reports can be reproduced
  or clearly identify why underlying retention prevents full regeneration.
- [ ] **R05 — Enforce distribution and retention boundaries** · P1 · M2 · Improve · M. Depends: R01, F07.
  Done: recipients/downloads are scoped, expired links fail, deleted schedules stop future
  delivery and stored PDFs follow a declared retention policy. Test unauthorized access
  to another report ID and stale links after permission changes.
- [ ] **R06 — Add fair period and production comparisons** · P2 · M3 · New · M. Depends: R02, O05.
  Done: compare shifts/jobs/machines with product mix, scheduled time, quality coverage
  and corrections visible; allow energy/maintenance additions only when their inputs
  exist. Do not rank incomparable periods as if differences proved improvement.

## Quality and traceability

- [ ] **Q01 — Validate SPC methods and baseline lifecycle** · P1 · M3 · Improve · L. Depends: F02, H01.
  Done: test evaluator reference datasets, sample spacing, minimum sample counts,
  zero variance, missing/bad values and restart behavior; baseline approval/revision
  records the process/product context and never silently trains on a fault period.
- [ ] **Q02 — Add appropriate control charts and capability** · P2 · M3 · New · L. Depends: Q01.
  Done: select I-MR, subgroup or attribute charts only for declared data assumptions;
  distinguish specification from control limits. Cp/Cpk or other capability output
  requires a qualified baseline and shows sample size/assumptions instead of false precision.
- [ ] **Q03 — Record inspections, rejects and rework** · P2 · M3 · New · L. Depends: O04, U03.
  Done: inspection plans and defect reasons link to product/job/batch; corrections
  retain history and do not double-count a reworked part as both new output and scrap.
  Manual inspection evidence is visibly distinct from automatic sensor evidence.
- [ ] **Q04 — Harden batch lifecycle and summaries** · P1 · M3 · Improve · M. Depends: O04.
  Done: concurrent starts, transitions, missing data and partial batches have tested
  behavior; summary windows use actual batch boundaries and product context. Start/stop
  buttons clearly describe application records rather than PLC control.
- [ ] **Q05 — Add bounded lot and batch genealogy** · P2 · M3 · New · L. Depends: Q04, Q03.
  Done: input/output lots, splits, merges and affected batches can be traced with stable
  IDs and corrections; export a demonstrable trace query. Scope this to observed records,
  without promising a complete supply-chain or regulated recall system.
- [ ] **Q06 — Compare recipes with observed settings** · P2 · M3 · Improve · L. Depends: Q04, C04.
  Done: approved recipe revisions and tolerances can be compared to read-only measured
  parameters; deviations retain time, quality and context. Recipe edits do not apply
  machine setpoints, and unavailable parameters are not treated as matching.
- [ ] **Q07 — Strengthen audit records without compliance overclaims** · P1 · M3 · Improve · L. Depends: F07, Q04.
  Done: verify concurrent integrity-chain updates, actor identity, signature purpose,
  correction reasons and exports; document database-admin/tamper boundaries. Keep
  regulatory claims disabled until a separate named validation program establishes them.

## Maintenance and energy

- [ ] **M01 — Add asset history and maintenance records** · P2 · M3 · New · M. Depends: C04, U04.
  Done: interventions, findings and attachments link to the asset and relevant trend/stop;
  an owner can close/reopen the application record with an audit trail. Existing CMMS
  identifiers can be stored without attempting to replace a complete CMMS.
- [ ] **M02 — Track usage-based maintenance intervals** · P2 · M3 · New · M. Depends: M01, O05.
  Done: runtime/cycle counters support explicit resets and service baselines; due/overdue
  states show missing-data uncertainty. Replacing a component does not erase the parent
  machine's lifetime measurements.
- [ ] **M03 — Build a condition-to-inspection workflow** · P2 · M3 · New · L. Depends: M01, A02, Q01.
  Done: qualified thresholds/trends create reviewable maintenance suggestions linked to
  evidence and outcomes; measure false positives. No claim of predicting remaining life
  is made from an unvalidated threshold or insufficiently sampled vibration signal.
- [ ] **M04 — Add trustworthy energy and utility accounting** · P2 · M3 · New · L. Depends: H01, O05.
  Done: distinguish power from energy, integrate only appropriate samples, handle meter
  resets and units, and report kWh or utility consumption per good unit with coverage.
  Reconcile one meter interval against an independent reading.
- [ ] **M05 — Add optional cost and emissions estimates** · P2 · M3 · New · M. Depends: M04.
  Done: user-supplied tariff/currency/emission-factor versions and validity periods are
  explicit; missing factors stop the estimate. Label results as estimates with allocation
  assumptions, not billing-grade measurements or certified emissions statements.
- [ ] **M06 — Compare idle losses and improvement actions** · P2 · M3 · New · M. Depends: M04, O02.
  Done: correlate consumption with production/idle states, show candidate avoidable usage
  and compare normalized periods after an action. Retain changes in product mix, operating
  hours and meter coverage so correlation is not presented as proof of causation.

## Integrations and extension points

- [ ] **I01 — Introduce a durable integration outbox** · P1 · M2 · Improve · L. Depends: F03, H01.
  Done: actual application events enter a durable queue with stable IDs, schema versions,
  scoped payloads, retries/backoff and dead-letter inspection; receivers can deduplicate.
  Test process failure around send/ack and keep outbound-request protections intact.
- [ ] **I02 — Publish a bounded integration API contract** · P1 · M2 · Improve · L. Depends: H01, F07.
  Done: document supported machine/history/job endpoints, errors, scopes, pagination,
  rate limits and version policy; supply runnable examples and contract tests. Align
  REST/tRPC ownership without rewriting working callers solely for architectural symmetry.
- [ ] **I03 — Provide one ERP work-order exchange** · P2 · M2 · New · L. Depends: I02, O04.
  Done: import a sanitized order/product contract with preview, external IDs, idempotency
  and rejection reporting; export completion facts without silently editing ERP records.
  A named pilot validates field meanings before a vendor-specific connector is promised.
- [ ] **I04 — Provide a CMMS handoff contract** · P2 · M3 · New · M. Depends: I01, M01.
  Done: a maintenance suggestion can be exported or explicitly submitted to a configured
  destination with asset/event identity and delivery status; duplicate delivery cannot
  create uncontrolled duplicate work orders. Keep review and remote-write permissions explicit.
- [ ] **I05 — Support portable configuration bundles** · P1 · M2 · Improve · M. Depends: C04, F07.
  Done: bundle dashboards, mappings, rules and relevant revisions with schema version,
  secret exclusion, conflict preview and rollback; imports cannot overwrite unrelated
  configuration silently. Cross-version import and invalid-file cases have fixtures.
- [ ] **I06 — Research a TIA MCP engineering handoff** · P2 · M5 · Research · L. Depends: C04, I02.
  Done: agree a versioned export containing asset/tag metadata, namespace/type information
  and provenance; demonstrate reviewed mapping suggestions from a sanitized fixture.
  No assumption of an existing shared schema, automatic PLC attachment or write permission.
- [ ] **I07 — Qualify the custom-widget runtime** · P3 · M5 · Improve · L. Depends: F07, U06.
  Done: prove actual rendering, iframe isolation, origin-checked messaging, permissions,
  versioning and removal; a malicious test widget cannot access unrelated data or parent
  credentials. Do not call manifest registration alone a working widget SDK.
- [ ] **I08 — Evaluate connector packaging for contributors** · P3 · M5 · Research · M. Depends: C10, I02.
  Done: use lessons from two real adapters to choose a minimal extension interface,
  fixture contract and compatibility policy. Prefer existing module patterns; do not
  introduce dynamic server-code loading or a marketplace without a concrete need.

## Deployment and operation

- [ ] **D01 — Document and verify the OT deployment boundary** · P0 · M0 · Improve · M. Depends: F07.
  Done: diagrams name acquisition, database, web and optional outbound paths; least-privilege
  identities, TLS termination, firewall assumptions and metrics exposure are verified in
  an isolated deployment. No open internet access to a PLC is required by the design.
- [ ] **D02 — Implement a complete backup and restore procedure** · P0 · M0 · New · L. Depends: H01.
  Done: cover PostgreSQL, configuration, required spool state, certificates and secret
  recovery with protected storage; restore into an isolated fresh installation and
  reconcile data. Dashboard-only export remains clearly labeled as configuration export.
- [ ] **D03 — Make upgrades and rollback operationally safe** · P0 · M0 · Improve · L. Depends: D02.
  Done: migrations are tested on a copy of the previous schema/data, compatibility is
  declared, and backup/rollback behavior is documented. Failed startup cannot leave a
  silently half-migrated collector writing incompatible measurements.
- [ ] **D04 — Measure the supported operating envelope** · P1 · M1 · New · L. Depends: F06, H02.
  Done: benchmark named hardware at declared tag rates, database size, dashboard users
  and export load; publish ingestion lag, p95 queries, memory, CPU and bytes/sample.
  Include replay competing with live acquisition, then choose limits from evidence.
- [ ] **D05 — Make health and diagnostics actionable** · P1 · M1 · Improve · M. Depends: D01, H03.
  Done: readiness distinguishes accepting requests from collecting/persisting data;
  metrics cover reconnects, spool age, failed jobs and database lag. A redacted support
  bundle excludes secrets and has explicit size/time bounds.
- [ ] **D06 — Complete the first pilot acceptance pack** · P1 · M1 · New · L. Depends: D02, D04, D05, O09, R01, C04.
  Done: record exact machines/settings/software, supervised shift reconciliation,
  interruptions, restore evidence, observed defects and unresolved limits; the process
  owner accepts the bounded pilot. Automation alone cannot close this item.
- [ ] **D07 — Support a documented disconnected installation** · P2 · M2 · New · M. Depends: D03.
  Done: installation/update artifacts, dependencies, image digests and instructions work
  without runtime internet access; disabled external email/AI/report destinations fail
  clearly. License notices and dependency inventory accompany the package.
- [ ] **D08 — Design high availability from measured needs** · P2 · M4 · Research · XL. Depends: D04, H08, E03.
  Done: distinguish database recovery, web redundancy and collector ownership; demonstrate
  fencing against two active collectors and test failover on a declared topology.
  Defer implementation if the pilot's recovery targets are met by simpler operation.

## Enterprise and multi-site

- [ ] **E01 — Enforce site and asset permissions consistently** · P1 · M2 · Improve · L. Depends: F07.
  Done: server-side checks cover history, live subscriptions, reports, exports, rules and
  background jobs for at least two sites; changing permissions invalidates stale access.
  UI filtering alone never qualifies the boundary.
- [ ] **E02 — Add federated identity and service-account scopes** · P2 · M4 · New · L. Depends: E01.
  Done: a selected OIDC provider, session revocation and least-privilege machine accounts
  pass positive/negative tests; delegated MFA follows the identity provider policy.
  Document a controlled recovery path without an unrestricted hidden admin bypass.
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
- [ ] **E06 — Decide whether separate-company tenancy is justified** · P3 · M5 · Research · XL. Depends: E02, E03, E05.
  Done: compare separate installations with a hosted tenancy design using real demand,
  costs and threat boundaries; require independent isolation testing before implementation
  is accepted. Continue separate-company deployments unless the gate is explicitly passed.

## Analytics and experiments

- [ ] **X01 — Build grounded, permission-aware data questions** · P3 · M5 · Improve · XL. Depends: F05, I02, E01, R04.
  Done: use an allowlisted analytical query layer with timeouts, row limits and normal
  permissions; answers cite executed results, filters, time/coverage and uncertainty.
  Evaluate hallucination/prompt-injection cases and require explicit external-data policy.
- [ ] **X02 — Evaluate anomaly and predictive-maintenance models** · P3 · M5 · Research · XL. Depends: Q01, M03, H07.
  Done: compare against a simple threshold baseline on held-out periods/assets with
  labeled incidents; publish false-positive, missed-event and lead-time behavior plus
  drift monitoring. Reject the feature if labels or operational value are insufficient.
- [ ] **X03 — Add incident replay and diagnostic correlation** · P2 · M3 · New · L. Depends: H07, A01.
  Done: replay a bounded historical window with signal quality, events, changes and
  annotations in time order; separate source/receive clocks and missing intervals.
  Correlated signals are presented as investigation leads, not proven causes.
- [ ] **X04 — Prototype bounded capacity and completion forecasts** · P3 · M5 · Research · L. Depends: O05, R06.
  Done: estimate using comparable jobs and recent capacity with uncertainty ranges;
  backtest against actual completion and disclose unsupported process changes. Forecasts
  are advisory and do not automatically reschedule or control machines.
- [ ] **X05 — Evaluate a read-only AI/MCP access surface** · P3 · M5 · Research · L. Depends: I02, E02, X01.
  Done: scope tools to approved queries with user identity, provenance and query budgets;
  demonstrate cross-user/site denial and malicious-input handling. No arbitrary SQL,
  secrets retrieval or PLC writes are exposed through the assistant interface.
- [ ] **X06 — Test improvement recommendations with evidence** · P3 · M5 · Research · M. Depends: X03, R06, M06.
  Done: recommendations cite loss/energy/maintenance evidence and assumptions, allow
  human dismissal and link accepted actions to outcomes. Compare usefulness with a
  simple ranked loss list before adopting model-generated advice.

## Public project and pilot learning

- [ ] **P01 — Validate the first customer and machine use case** · P1 · M0 · Research · M. Depends: none.
  Done: document interviews/observation with an operator, engineer and production lead,
  a nominated line, actual protocols, current reporting effort and the first improvement
  question. Until available, retain these as explicit hypotheses and a simulator-only scope.
- [ ] **P02 — Build a realistic, repeatable demonstration** · P1 · M1 · Improve · M. Depends: O04, O05, A01.
  Done: owned simulator scenarios include run/stop, counts/rejects, job changes, bad quality,
  reset and outage/replay; a scripted walkthrough yields known results. Mark all demo
  screenshots/data synthetic and avoid implying real-machine qualification.
- [ ] **P03 — Publish useful community examples and wiki navigation** · P1 · M2 · Improve · S. Depends: P02.
  Done: initialize/verify the GitHub wiki publication path if still needed, keep its source
  in docs/wiki, and provide sanitized mapping/dashboard/report examples with expected
  outputs. Accept contributions without uploading customer data or machine credentials.
- [ ] **P04 — Establish evidence-backed versioned releases** · P1 · M2 · Improve · M. Depends: D03, F10.
  Done: a release identifies commit/image digest, changelog, migrations, compatibility,
  SBOM/dependency notices and checks for that exact revision; package signatures/provenance
  are verified. A release label does not erase open physical/security acceptance limits.
- [ ] **P05 — Make focused contributions easier** · P2 · M2 · Improve · S. Depends: F10.
  Done: label small tasks by subsystem and expected evidence, document connector/widget
  boundaries and add fixtures useful to reviewers. Maintain existing public-repo policies
  instead of adding redundant workflows or unmaintained template files.
- [ ] **P06 — Review product usefulness after each pilot milestone** · P1 · M1 · Research · M. Depends: D06, P01.
  Done: compare commissioning effort, report preparation time, unresolved stop reasons
  and user-observed usefulness against the agreed baseline; reorder or remove backlog
  items accordingly. Record qualitative evidence when reliable quantitative data is absent.

## Completion policy

For every completed item, append `Evidence: <PR/commit and validation reference>`.
Record any explicit scope reduction beside it. An item waiting for real hardware,
customer feedback or independent acceptance stays open with its concrete blocker;
do not substitute mock evidence. Update [STATUS](docs/STATUS.md), compatibility,
research and the wiki when support claims actually change.
