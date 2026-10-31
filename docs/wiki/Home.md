# Performance Dashboard

The [maintainer handbook](https://github.com/Sparkz400/performance_dashboard/blob/main/MAINTAINERS.md)
documents current responsibility, review and release procedures, decisions and the
rehearsal needed before another person takes on a maintainer role. No second
maintainer or publisher-key custodian is appointed by publishing the handbook.
Start contributing through the [curated issue index](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/CONTRIBUTOR_BACKLOG.md):
documentation, translations, simulator examples and focused tests, each with starting
files and completion criteria. GitHub issues carry current availability and status.

The [dependency review](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DEPENDENCY_REVIEW.md)
records the lint migration that removes the development-dependency exception.
All npm advisories block CI. The guarded OPC UA overflow patch remains pending
[upstream resolution](https://github.com/node-opcua/node-opcua/issues/1849).

The [public correctness benchmark](https://github.com/Sparkz400/performance_dashboard/blob/main/benchmarks/correctness/README.md)
publishes 15 synthetic shift/OEE cases and independently specified answers, with a
comparison runner for other implementations.
[Engineering feedback](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/ENGINEERING_FEEDBACK.md)
describes four isolated CI groups, retained required checks, timing/failure receipts
and browser resource diagnostics. Short checks do not establish multi-day reliability.

See the [acceptance execution record](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/ACCEPTANCE_EXECUTION.md)
for all remaining pilot gates and the evidence needed to close them. Unsigned
candidates do not establish publisher trust.

The [desktop and phone interface](https://github.com/Sparkz400/performance_dashboard/blob/main/DESIGN.md)
opens on the shift overview. Custom dashboards stay available separately. On a phone,
use **More** for all permitted administration, quality, reporting and asset destinations.
Operations is grouped by work area; Settings has a labelled section selector.

[Data integrity and reviewed operations](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DATA_INTEGRITY.md)
adds evidence-backed widgets, reviewed corrections, bounded calculated signals,
explicit offline drafts, durable CMMS handoffs and versioned energy estimates.
Frozen reports and physical qualification remain separate.

[Factory operations](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/FACTORY_OPERATIONS.md)
adds reviewed setup transfer, connection/alarm diagnostics, work-order files,
interactive asset context, synthetic walkthroughs and signed offline release candidates;
the next package updates an installation offline after a verified backup.
Physical, ERP vendor and publisher-trust acceptance remain separate gates.

[Factory readiness](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/FACTORY_READINESS.md)
adds scoped supervisor line/action workflows, attributable maintenance corrections,
fair comparisons of frozen shift reports and full-application endurance testing.
Maintenance correction history is preserved without a fixed count ceiling and
browsed in pages; shift calculations use a boundary sweep with unchanged evidence rules.
Short runs do not establish multi-day reliability; physical qualification remains open.

Industrial monitoring with OPC UA machine connections, configurable dashboards,
historical trends and OEE. Development software for owned simulators and isolated
test equipment; physical-machine and production acceptance remain open.

The first P0 wave fixes trend completeness, SPC isolation and measurement identity.
Edge sites can send committed history to a central installation ([edge sites](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/MULTI_SITE.md)), and
single sign-on is available ([identity](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/IDENTITY.md)). The AI assistant and provider integration have been removed.
See [acceptance evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/P0_ACCEPTANCE.md),
the per-screen [acceptance matrix](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/ACCEPTANCE_MATRIX.md),
the WCAG 2.2 [accessibility checklist](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/ACCESSIBILITY.md),
the [security and deployment boundaries](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/SECURITY_BOUNDARIES.md)
and the [data ownership and retention inventory](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DATA_OWNERSHIP.md).

- [[Getting Started]]
- [[Architecture]]
- [[Roadmap]]
- [[FAQ]]
- [Detailed documentation](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/GETTING_STARTED.md)
- [Current status and limits](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/STATUS.md)
- [Capability assessment and research](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/RESEARCH.md)
- [Actionable TODO backlog](https://github.com/Sparkz400/performance_dashboard/blob/main/TODO.md)
- [Contributing](https://github.com/Sparkz400/performance_dashboard/blob/main/CONTRIBUTING.md)

This wiki is published from `docs/wiki/` on `main`; direct edits are overwritten.

The [production workflow](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/PRODUCTION_WORKFLOW.md)
covers guided commissioning, immutable shift profiles, operator corrections,
reconciled reports, durable alarm delivery and the single-company permission policy.
Sharing is limited to expiring, revocable links to selected trends; legacy notification
channels are disabled. Physical qualification remains open. Protected OPC UA identities and explicit certificate trust are covered by
owned-server tests; see the [S7-1500 pilot guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/S7_1500_PILOT.md).

The full npm audit and migrated Node 24/Wolfi image scan are clear in this wave.
Scheduled reports use direct PDF generation; see the [reporting guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/REPORTING.md)
and [security review](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DEPENDENCY_REVIEW.md).

The [operations guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/OPERATIONS.md)
covers isolated installation previews, complete backups and restore/upgrade checks.
[Releasing](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/RELEASING.md)
describes signed packages and publisher-key custody, and the
[examples](https://github.com/Sparkz400/performance_dashboard/blob/main/examples/README.md)
are sanitized starting points with checked outputs.
[Capacity evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/CAPACITY.md)
declares the synthetic workload and its limits; it is not physical PLC qualification.

[Operator handover and wallboard](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/OPERATOR_WORKFLOW.md)
cover attributable actions, reviewed manual declarations, current job/target context
and a restricted display account. Physical viewing-distance acceptance remains open.

[Unattended operation](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/UNATTENDED_OPERATION.md)
covers durable report recovery, separate email retry status, measured alarm holds
and collector/data-health incidents, including SMTP and self-monitoring limits,
spool capacity and quarantine, and the single-collector lock with fenced leases
([high availability](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/HIGH_AVAILABILITY.md)).

The [integration API contract](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/INTEGRATION_API.md)
lists the supported read endpoints, error shape, rate limits, durable webhook outbox
and version policy, with a runnable example client.

[Daily factory workflows](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DAILY_OPERATIONS.md)
cover scoped roles, history retention, calendars/product runs, immutable reports,
maintenance and energy. [Acceptance evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DAILY_OPERATIONS_ACCEPTANCE.md)
separates software checks from physical S7-1500 and operator acceptance.

[Quality and line operations](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/QUALITY_LINE_OPERATIONS.md)
adds frozen batch recipes, race-free batch records, inspection/rework/lot evidence,
reviewed SPC reference periods, restart-stable live SPC, a tamper-evident audit chain, production-line analysis and alarm-linked maintenance actions. It also
covers measured disk runway, exact reviewed retention schedules, offline image
bundles and configurable synthetic endurance workloads using the compiled frontend
and confirmed browser session renewal, with bounded network evidence for failures. Scoped supervisor access
now extends line investigations and alarm actions. These workflows do not establish
multi-day reliability or supported hardware capacity.

## Evaluate, contribute and reproduce

Use the [persistent interactive demo](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/INTERACTIVE_DEMO.md)
for guided synthetic shifts, safe reset and restart persistence. The
[machine-profile catalog](https://github.com/Sparkz400/performance_dashboard/blob/main/profiles/README.md)
separates simulator, reported and physical qualification claims. A
[portable shift evidence export](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/SHIFT_EVIDENCE.md)
recalculates one shift/OEE offline with Node.js 24, without a database or installed dependencies.
