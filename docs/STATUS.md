# Current status

Performance Dashboard is development software. Its intended starting point is an
owned simulator or an isolated test installation using OPC UA scalar signals.

## P0 software closure

The remaining P0 software items are closed: a per-screen
[acceptance matrix](ACCEPTANCE_MATRIX.md) (F01/F10), a generated route × role ×
identifier access matrix with three socket/owner disclosures fixed (F07), expiring
selected-data links (F08), an exact-revision security review (F09) and a verified
deployment boundary with a non-superuser database role (D01). See
[security and deployment boundaries](SECURITY_BOUNDARIES.md). The 72-hour endurance
gate and physical/customer acceptance remain open.

## P1 gap closure

Report revisions after the first need a reason and can be regenerated to check
reproducibility (R04). Reviewed operator quantity declarations fill incomplete counters
with labelled, never-verified results (O05). Restores cancel pending retention deletions
(H05). `/metrics` covers reconnects, spool age, commit age, database round trip and job
states (D05). Daily operations has machine search, remembered filters and
language-aware number/date formatting (U07).

## Backlog wave 1

Alarm rules keep a trigger-recorded version history and replayed samples are judged by
the version in force at receipt (A08). Shift reports list open handover actions with
owner, priority, due time and reference (R02). Deleting a report schedule cancels its
pending runs and email, and opt-in `REPORT_RETENTION_DAYS` removes old PDFs (R05).
Alarm rules are scoped per site on every read path (E01).

## Backlog wave 2

One collector per database holds a PostgreSQL advisory lock; a second waits with an
incident. Subscription limits are set per endpoint, overflow is visible and reconnect
attempts are spread (C09). Spool capacity, reserve and alert thresholds are
configurable; operators see backlog bytes, age, write rate and failures, and records
PostgreSQL refuses are quarantined for audited export and retry (H09). Webhooks are a
durable outbox with schema versions, dead letters and audited requeue (I01), under a
bounded [integration API contract](INTEGRATION_API.md) with a runnable example (I02).
Raw and retained-summary history answer identically, and an index benchmark records
which indexes the history endpoints use (H06). The database container gets 256 MB of
shared memory for parallel maintenance on large history.

## Backlog wave 3

Live SPC judges only full windows against a positive approved baseline, restarts runs
after bad data, ignores re-sent samples, rebuilds windows after a restart and uses the
standard CUSUM decision interval (h = 5σ instead of 2.5σ) (Q01). Batch start, complete
and abort are race-free and labelled as application records (Q04). The audit chain is
serialised, covers every recorded field and detects deletions; signatures need the
signer's password and a stated meaning, forged signature metadata is refused, and the
UI no longer presents a 21 CFR Part 11 checklist (Q07). Seven screens pass an automated
WCAG 2.2 A/AA scan with zero findings, and widgets can be moved and resized without
dragging ([accessibility](ACCESSIBILITY.md), U06; screen-reader walkthrough open).

## Backlog wave 4

Releases have a written procedure with publisher-key custody, generated notes (changes,
new migrations, open P0/P1 items), the compatibility list in the signed package and an
evidence collector for the exact image ([releasing](RELEASING.md); the first signed
release waits for the publisher key, P04). The GitHub wiki is published from
`docs/wiki`, and sanitized dashboard and report examples have checked outputs (P03).
Line reports add cycle histograms and a loss Pareto and withhold microstops the state
sampling cannot resolve (O07). Offline sites see unreachable mail and webhook
destinations clearly (D07). CONTRIBUTING maps subsystems to the evidence to run (P05).

## Backlog wave 5

SPC profiles declare their data assumption and get an I-MR or X̄-R chart with limits from
the approved reference period; attribute charts are not offered for live signals (Q02).
Alarm email is a destination kind in the durable outbox, and every destination can be
routed by lowest severity and machine (A05).

## Backlog wave 6

Retention keeps seconds per production state and counter increments of commissioned
production signals, computed with the shift report's own rules, so removing raw readings no
longer reduces those signals to averages (H06).

## Backlog wave 7

Supervisors compare changeovers between product runs with expected times per product
transition; unknown, never-running and cross-shift transitions are listed unmeasured and
nothing ranks operators (O06). Declared lot links are corrected by appended, attributable
records that balances, cycle checks and the trace respect (Q05). A
[data ownership inventory](DATA_OWNERSHIP.md) lists stored data, exports, outbound flows,
deletion and retention; exports, retention steps, configuration deletions, destination
changes and failed sign-ins are now audited, and a destination's signing secret is
returned only at creation (E05). Shift reports need no rollup fallback because retention
protects their readings (H06 decision).

## Backlog wave 8

Machines with little or no automatic data run on reviewed manual state and count
declarations that fill only unknown time and never verify a report (O10). Inspection plans
and manual inspections cover a shift's products outside batches, with rework counted once
and corrections kept (Q03). Service records link the stop and trend they concern and keep
type-checked attachments (M01). Improvement actions are compared with normalised periods
before and after them, with mix, hours and meter coverage shown (M06).

## Backlog wave 9

Commissioning proposes signal mappings from a declared Machinery information model with
high confidence and from browse names with low confidence, each with its provenance; a
person still reviews and saves the profile (C08). Custom widgets now render in a sandbox
with an opaque origin and a minimal message protocol, receive only declared data, keep
their version and are blocked from the page, storage, session and API; previously only
registration existed and the CSP blocked widget frames (I07,
[protocol](CUSTOM_WIDGETS.md)).

## Data integrity and reviewed operations

The [six-feature integrity wave](DATA_INTEGRITY.md) replaces generated widget data,
adds reviewed historian corrections and safe calculated signals, retains explicit
offline operator drafts, and provides reviewed CMMS handoffs and versioned energy
estimates. Frozen reports remain intact; physical/vendor acceptance and PR #63's
72-hour endurance gate remain separate.

## Factory operations expansion

The [six-workflow expansion](FACTORY_OPERATIONS.md) adds configuration bundles,
connection diagnostics, alarm review, vendor-neutral work-order files, a practical
asset overview, and repeatable demonstration/signed release packaging. Validation
is recorded separately from physical-machine and ERP vendor acceptance. The new
work uses a separate checkout from PR #63's endurance repair and replacement run.

## Implemented and covered by focused tests

- Scoped supervisor line investigations and maintenance assignment corrections,
  with attributable history and stale-version rejection; English/German advanced
  operational screens.
- Frozen shift-revision comparisons with product mix, schedule, definitions,
  coverage and corrections visible. Incomparable periods have no difference claim;
  service context does not imply causation. See [factory readiness](FACTORY_READINESS.md).

- Quality-aware batch summaries with unknown values, frozen recipes, inspections,
  verified rework and declared lot genealogy; approved SPC reference capability.
- Line definitions, blocked/starved/microstop/cycle evidence and uncertainty-aware candidates.
- Alarm-linked maintenance actions, expiring suppression, UTC quiet hours and durable escalation.
- Measured disk runway, exact reviewed retention schedules, offline image packaging
  and configurable synthetic endurance workloads. See [scope and limits](QUALITY_LINE_OPERATIONS.md).
  Full multi-day operation, browser-user capacity and physical qualification remain open.
  Installation endurance now has a separate full-application workload; only its
  completed receipts establish the actual duration and workload tested.
  Failed sustained runs and a later database-interruption CI exit keep this gate
  open. A checked-out client disconnect fix passes isolated rollback/recovery
  regression; replacement endurance acceptance is pending.

- Machine/site grants across REST, tRPC, sockets and exports; operator/supervisor roles.
- Streaming raw history, reviewed retention, quality-aware hourly summaries and storage estimates.
- Recurring calendars/holidays/DST, product runs, declared rollover and frozen report revisions.
- Maintenance plans, observed runtime/cycles, inspections, attributable service and incident links.
- Metered energy, per-good-part/idle/changeover losses and independent reconciliation.
- English/German core workflows, account cache isolation, freshness, keyboard/touch and deferred widget loading.
  See [daily operations](DAILY_OPERATIONS.md) and [acceptance](DAILY_OPERATIONS_ACCEPTANCE.md).

- Bounded incident replay with quality/gaps, separate clocks, immutable operator
  revisions and retrospective stop classifications; [replay contract](INCIDENT_REPLAY.md).
- An opt-in read-only Modbus TCP adapter with encrypted, co-located OPC UA and a
  reusable profile; [legacy gateway scope and recipe](LEGACY_GATEWAY.md).
- Durable report jobs, missed-slot catch-up, independent email retry status, alarm
  holds/hysteresis and data-health incidents; [unattended operation](UNATTENDED_OPERATION.md).
- Attributable operator handover/actions, reviewed manual declarations and a
  restricted supervisor display; [operator workflow](OPERATOR_WORKFLOW.md).
- Protected OPC UA identities, explicit trust, expiry/hostname checks and browser
  commissioning with redacted diagnostics; [S7-1500 pilot scope](S7_1500_PILOT.md).
- Isolated installation/restore previews, complete image/database/file backups and
  failed-upgrade rollback acceptance; [operations](OPERATIONS.md).
- A measured synthetic replay/query/export workload and provisional rehearsal
  limits; [capacity evidence](CAPACITY.md). Sustained PLC capacity remains unqualified.

- Raw Boolean, string and numeric measurements with quality metadata and numeric projection.
- Durable queue recovery through process termination, database connection outage,
  interrupted replay and SQLite capacity failure; accepted events retain stable identities.
- One alarm evaluator, atomic event receipts, persisted webhook retries and measured recovery.
- UI commissioning, reusable immutable profiles, shift snapshots, operator corrections
  and a reconciled/printable shift report verified against an independent fixture.
- Current-account REST/tRPC permissions, signed-in socket actors, logout and expiry.
- OEE boundary clipping, unchanged states, missing intervals and observed counter resets.
- Explicit incomplete-coverage handling and conversion of API ratios to UI percentages.
- Authenticated application routes and configurable machine/tag management.
- New-measurement source identity, mapping revision and receive time survive replay;
  legacy rows retain unknown provenance rather than receiving invented metadata.
- Machine/profile-isolated SPC state and baselines; statistical qualification remains open.
- Full-window bounded trend aggregation, quality gaps and visible resolution/counts.

See [P0 acceptance evidence](P0_ACCEPTANCE.md) for tests, fixtures and remaining work,
and [dependency PR dispositions](DEPENDENCY_REVIEW.md) for the reviewed update set.
The six later software milestones and current local validation are recorded in
[factory-pilot acceptance](FACTORY_PILOT_ACCEPTANCE.md).

Consult the CI run for the exact commit you intend to use. Hosted tests and local
simulator evidence do not establish physical-machine acceptance or release readiness.

## Known limits

- No physical machine or production-line qualification has been completed here.
- OPC UA scalar values, anonymous sessions and protected username/password or user-certificate
  identities are supported in owned-server acceptance. Protected identities require an
  encrypted channel and explicit certificate trust. See the [S7-1500 pilot guide](S7_1500_PILOT.md).
- Process crashes and unobserved machine events can leave uncertain intervals;
  reconnection notifications cannot reconstruct measurements never received.
- Shift profiles explicitly choose reset-to-zero, reject-decrease or declared rollover.
  Legacy OEE still assumes reset-to-zero. Calendars handle IANA timezones, holidays and
  explicit DST ambiguity. Unsampled counter/run boundaries prevent verified reports;
  resets near rollover and multiple wraps still require source/sampling qualification.
- The disk spool needs free space, a persistent volume and a single collector.
- Edge/cloud transfer and ingest are disabled: previously transferred queue records
  do not establish queryable central history. Retained records remain visible in settings.
- The AI assistant, query endpoint and external-provider configuration have been removed.
- Compliance, recipes and digital twins remain experimental. Legacy notification
  channels are disabled. Read-only links expose only selected trend signals for a
  bounded window, expire within 30 days and act as bearer capabilities. Site/asset scope is enforced within
  one installation; this does not establish tenant isolation. See the
  [production workflow and evidence](PRODUCTION_WORKFLOW.md) and [TODO](../TODO.md).
- Separate companies must use separate installations. Tenant isolation is unqualified.
- The full npm audit reports zero vulnerabilities, including development tools.
  Security CI now blocks advisories at every severity and preserves the full audit.
  Scoped UUID/esbuild overrides and their compatibility checks are documented in
  [the review](DEPENDENCY_REVIEW.md). CSRF and cross-origin socket regression checks pass.
- The Node 24/Wolfi image renders scheduled PDFs without Chromium and has zero
  findings in the pilot image's full scan (28 OS and 556 Node packages). Actual-image collection,
  recovery, reporting and persisted-volume checks pass. CI preserves complete scan
  evidence and blocks all high/critical findings, including unfixed ones. See the
  [reporting migration](REPORTING.md) and [image review](DEPENDENCY_REVIEW.md).
  The F09 boundary review is recorded in [security boundaries](SECURITY_BOUNDARIES.md);
  physical and site deployment qualification remain open.

## Next acceptance milestone

One installation, one production line, a small set of explicitly documented
machines and a complete shift report reconciled with independent measurements.
Include downtime, reconnects, counter resets and database interruptions.

The [roadmap](ROADMAP.md) describes staged acceptance gates and future features.
Planned work does not expand the supported scope above.
