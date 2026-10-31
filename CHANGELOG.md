# Changelog

Notable changes to Performance Dashboard, newest first. Task status lives in the
[TODO checklist](TODO.md); [current status](docs/STATUS.md) states what is and is
not qualified. Versions follow [Semantic Versioning](https://semver.org/); before
1.0.0 any minor version may change behaviour, APIs or migrations. A version label
never closes an open acceptance item.

## [Unreleased]

## [0.1.0] — 2026-10-31

First tagged pre-release: an **unsigned candidate** for isolated evaluation with
owned simulators and test equipment. It is not physically qualified, and the
publisher signing key is not yet established ([releasing](docs/RELEASING.md)).
The generated release notes list every open P0/P1 item and gate at this revision.

### Added

- Container image on the GitHub Container Registry for `linux/amd64` and
  `linux/arm64`, with build provenance attestations
  ([getting started](docs/GETTING_STARTED.md#run-the-published-image)).
- One-click demo in GitHub Codespaces through a development container.
- This changelog; dated history moved here from the TODO checklist.

### Development history before 0.1.0

#### 2026-10-31 — Open-source readiness

- **Dependencies (OSS point 10):** the dated development-dependency exception is
  removed through the [coordinated lint migration](docs/DEPENDENCY_REVIEW.md#exception-removed-and-upstream-follow-through--2026-10-31).
  Strict audit and lint-policy regressions preserve the checks. The latest OPC UA
  package still reproduces the overflow defect; [upstream issue #1849](https://github.com/node-opcua/node-opcua/issues/1849)
  contains the tested proposed fix, and the local hash-guarded patch stays in place.
- **Maintainers (OSS point 9):** the [maintainer handbook](MAINTAINERS.md) names current
  responsibility, scope decisions, review/merge and release procedures, triage,
  incident handling and a bounded onboarding/handover rehearsal. Appointing another
  maintainer and their independent rehearsal remain human milestones.
- **Contributors (OSS point 4):** an initial [12 contributor issues](docs/CONTRIBUTOR_BACKLOG.md),
  linked to TODO IDs with observed gaps, starting files, bounded completion criteria
  and validation. Closing one does not automatically satisfy its parent acceptance item.
- **Correctness and feedback (OSS points 6 and 8):** the [public correctness benchmark](benchmarks/correctness/README.md)
  and [engineering feedback](docs/ENGINEERING_FEEDBACK.md): 15 independently specified
  cases, a standalone external-results comparator, four isolated CI groups retaining
  all 61 original commands, failure/timing receipts and sustained browser resource
  diagnostics ([PR #90](https://github.com/Sparkz400/performance_dashboard/pull/90)).
- **Community workflows (OSS points 1, 5 and 7):** a [persistent factory demo](docs/INTERACTIVE_DEMO.md),
  [validated profile catalog](profiles/README.md) and [portable shift/OEE evidence](docs/SHIFT_EVIDENCE.md),
  validated by `scripts/test-community-workflows.mjs`, `scripts/test-interactive-demo.mjs`
  and the shift-calculation unit tests.
- **Endurance:** the full runs on `3385acb0` and `9e75ca68` failed after 179 and 11
  cycles with `ERR_NO_BUFFER_SPACE`; the harness now retains a bounded Chromium NetLog
  ([investigation](docs/FACTORY_READINESS.md#browser-transport-investigation--2026-10-31)).
  Database outages restart PostgreSQL inside a constant network namespace.
- **Audit corrections:** legacy OEE preserves stale/bad-quality time and counter gaps;
  report deletion cannot revive a cancelled job; retention rechecks its reviewer.
  The [acceptance execution record](docs/ACCEPTANCE_EXECUTION.md) reopens U06/X04
  because their manual/pilot Done criteria remain unmet (95 checked, 22 open).

None of these additions closes the physical, operator, publisher-key or 72-hour
qualification items.

#### 2026-10-30 — Interface and recovery follow-through

- Desktop and phone administration share one navigation model; see the
  [interface guide](DESIGN.md).
- [PR #81](https://github.com/Sparkz400/performance_dashboard/pull/81) serves the compiled
  frontend during endurance and passes a four-cycle local recovery smoke. The replacement
  run on `1a5abff7` failed at hourly session renewal after 11 recovery cycles; the harness
  now confirms logout before login and exercises renewal in its short smoke.
- FR02 follow-through removes the 100-correction ceiling with a preserving history
  migration and machine-scoped paging. Manual-state calculation sweeps sorted
  boundaries while retaining measured-state precedence and unknown/conflict rules.

#### 2026-10-29 — Backlog reconciliation

The checklist lagged behind PRs #57, #59, #62, #63 and #64, whose acceptance
documents did not name backlog IDs. Each item was compared with its Done text and the
merged evidence: 23 items whose software criteria are covered by named tests were
checked with links, and stale progress notes now state the concrete remaining gap.
Items waiting for hardware, customers, supervised users or experimental-module
qualification stay open. The same day closed the remaining P0 software items F01,
F07, F08, F09, F10 and D01 ([security and deployment boundaries](docs/SECURITY_BOUNDARIES.md)).
A following P1 gap wave closed R04, O05, H05, D05 and U07; backlog wave 1 closed E01,
R05, R02 and A08, and recorded research decisions ([decisions](docs/RESEARCH_DECISIONS.md)):
I08, E06 and X02 closed as rejected; the rest stay open with explicit triggers.

#### 2026-10-28 — Data integrity, factory operations and factory readiness

- **Data integrity and reviewed operations** (H03/H07/H10/U09/I04/M05): honest widgets,
  reviewed measurement corrections, bounded calculated signals, explicit offline
  drafts, reviewed CMMS handoffs and versioned energy estimates. See
  [contracts, verification and remaining boundaries](docs/DATA_INTEGRITY.md).
- **Factory operations expansion:** portable setup bundles (I05), connection
  diagnostics (C09), alarm usefulness (A06), reviewed work-order exchange (I03),
  practical asset overview (U08), and repeatable demonstration/release packaging
  (P02/P04). See [implementation, usage and limits](docs/FACTORY_OPERATIONS.md).
- **Factory readiness** (FR01–FR03): full-application endurance, supervisor/maintenance
  workflows and fair period comparisons ([scope and acceptance](docs/FACTORY_READINESS.md),
  [PR #63](https://github.com/Sparkz400/performance_dashboard/pull/63)). FR01's harness and
  short-run recovery checks pass; sustained/CI failures keep its 72-hour gate open.
  A reproduced checked-out database-client crash has a focused fix and a
  forced-disconnect regression.

#### 2026-10-26 to 2026-10-28 — Daily factory workflows and factory pilot software

- **Daily factory workflows** (DF01–DF07; priorities 1–4, 6 and 7 of the next-wave
  review): [daily workflow acceptance](docs/DAILY_OPERATIONS_ACCEPTANCE.md) records tests
  and remaining hardware/operator boundaries; [PR #59](https://github.com/Sparkz400/performance_dashboard/pull/59)
  supplies integration evidence. TIA MCP integration is excluded.
- **Factory pilot software** for the nominated Siemens SIMATIC S7-1500 family: secure
  onboarding, installation/recovery, operator and supervisor flows, unattended operation,
  a read-only gateway and incident replay ([factory-pilot acceptance](docs/FACTORY_PILOT_ACCEPTANCE.md),
  [PR #57](https://github.com/Sparkz400/performance_dashboard/pull/57)). The read-only gateway
  passes owned two-unit commissioning, profile reuse, write rejection, bad-quality
  persistence, reconnect and managed identity restart checks ([gateway scope](docs/LEGACY_GATEWAY.md)).
- **First P0 wave:** F02/F04/F05/H01/H02 in [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40)
  ([P0 acceptance](docs/P0_ACCEPTANCE.md)). The production-workflow wave completes
  F03/F06/A01 and the bounded stop-reason, explainable-OEE and reconciled-report slice
  O02/O03/R01 ([evidence](docs/P0_ACCEPTANCE.md#production-workflow-wave)).
- **Dependency review:** all 29 dependency PRs were reviewed. Fifteen obsolete or
  incompatible proposals were closed with reasons; fourteen compatible proposals were
  consolidated into PR #40 ([PR dispositions](docs/DEPENDENCY_REVIEW.md)). Node 26
  proposal #41 was reviewed and closed; Docker major updates require an explicit F09
  support decision. The Gitleaks action (PR #42) was merged separately.

The backlog itself was created on 2026-10-26 from a code review of
`6b5556493e7c48687a43cc9d90df3aba0be1374e` and [primary-source research](docs/RESEARCH.md).

[Unreleased]: https://github.com/Sparkz400/performance_dashboard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Sparkz400/performance_dashboard/releases/tag/v0.1.0
