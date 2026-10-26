# Performance Dashboard

Industrial monitoring with OPC UA machine connections, configurable dashboards,
historical trends and OEE. Development software for owned simulators and isolated
test equipment; physical-machine and production acceptance remain open.

The first P0 wave fixes trend completeness, SPC isolation and measurement identity.
Edge transfer is disabled; AI generates suggestions without querying measurements.
See [acceptance evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/P0_ACCEPTANCE.md).

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
Public sharing and legacy notification channels are disabled. Physical qualification
remains open. Protected OPC UA identities and explicit certificate trust are covered by
owned-server tests; see the [S7-1500 pilot guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/S7_1500_PILOT.md).

The full npm audit and migrated Node 24/Wolfi image scan are clear in this wave.
Scheduled reports use direct PDF generation; see the [reporting guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/REPORTING.md)
and [security review](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DEPENDENCY_REVIEW.md).

The [operations guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/OPERATIONS.md)
covers isolated installation previews, complete backups and restore/upgrade checks.
[Capacity evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/CAPACITY.md)
declares the synthetic workload and its limits; it is not physical PLC qualification.
