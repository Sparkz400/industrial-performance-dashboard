# Current status

Performance Dashboard is development software. Its intended starting point is an
owned simulator or an isolated test installation using OPC UA scalar signals.

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
- Compliance, recipes and digital twins remain experimental. Public shares/embeds
  and legacy notification channels are disabled. Site/asset scope is enforced within
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
  Broader F09 boundary review and physical/deployment qualification remain open.

## Next acceptance milestone

One installation, one production line, a small set of explicitly documented
machines and a complete shift report reconciled with independent measurements.
Include downtime, reconnects, counter resets and database interruptions.

The [roadmap](ROADMAP.md) describes staged acceptance gates and future features.
Planned work does not expand the supported scope above.
