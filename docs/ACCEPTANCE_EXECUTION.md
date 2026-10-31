# Remaining acceptance execution record — 2026-10-31

The owner authorized owned simulators and an unsigned release candidate. Physical
pilot details and publisher key custody are unavailable. The original 20 open items
and two reopened acceptance items in [TODO](../TODO.md) stay open until their required evidence exists. Software repairs
cover OEE freshness/counter coverage, manual day boundaries, report cancellation,
retention reviewer activation, release-note completeness, dependencies and status prose.

## Original 20 open items

| Item | Available for rehearsal | Exact evidence needed to close |
| --- | --- | --- |
| FR01 | Full application endurance with owned OPC UA, browsers, alarms, PDF/email and interruption/replay checks | Final receipt with `passed=true`, `full72Hours=true`, at least 72 `lastCycle.workloadHours` and its exact source revision; a different revision needs its own assessment |
| C04 | Versioned profiles, namespace identities, import review and second-machine reuse | Device vendor/model/firmware/server version, approved signals and successful profile qualification on that endpoint |
| C05 | Read-only Modbus TCP 03/04 gateway, two-unit fixtures and reconnect contract | Actual legacy device and gateway version, cost/licensing/prerequisites, read-only mapping and observed recovery |
| C07 | Provisional Modbus choice and unsupported-protocol list | Pilot inventory ranking Modbus TCP/RTU, MTConnect and vendor gateways; recorded choice and reason |
| C10 | OPC UA, Modbus, MQTT and PLC-alarm fixtures; replay/duplicate, quality, timing and reconnect checks | Connector scenario record tied to vendor/model/firmware and profile revision; simulator success cannot populate a physical row |
| H09 | Durable spool limits, free-space reserve, quarantine export/retry and alerts | Approved outage duration and measured ingress/spool growth/replay capacity, configured limits and saturation/recovery receipt |
| O08 | Line topology and known synthetic bottleneck scenarios | Known physical line scenario compared with independent observation, including gaps and non-causal limitations |
| O09 | Frozen shift evidence and independent-ledger reconciliation | Supervised physical shift with independent good/reject/downtime ledger, discrepancy resolution and reviewer |
| U01 | Owned-machine commissioning, failures, preview and dashboard creation | First-time user completes the flow unaided; task time, recovery errors, observations and approval |
| U03 | Touch/keyboard handover, classification and reviewed declarations | Supervised operator tasks on the actual device, including accessibility and observed problems |
| U05 | Restricted wallboard, rotation, reconnect and freshness display | Sustained use on the intended display at the agreed viewing distance; readability, reconnect and stale-state observations |
| U10 | Deferred widget library, responsive flows and browser fixtures | Startup/navigation timings, update latency and memory on the named ordinary operator device, before/after on the same workload |
| Q06 | Frozen recipe tolerances and good-quality comparisons | Actual parameter meanings/units/tolerances, matching/deviating/missing cases and reviewer acceptance; remain experimental |
| M03 | Evidence-linked maintenance suggestions and outcomes | Qualified thresholds plus independently classified true/false positives and missed events over an agreed observation period |
| D04 | Named-host replay/live/query/export benchmark and endurance harness | Declared machine/tag/rate/user/export/database-size workload on target hardware; sustained lag, p95, memory, CPU, bytes/sample and chosen limits |
| D06 | Secure commissioning, isolated recovery, reconciliation and this record | Exact installation/device configuration, supervised interruption/restore/shift evidence, unresolved defects and process-owner acceptance |
| X06 | Rule-based recommendations, dismissals, action links and usefulness logs | Pilot users compare recommendations with the ranked loss list; outcomes and reasons without a causal claim |
| P01 | Interview guide, hypotheses and inventory questions | Operator, engineer and production-lead interviews/observation; nominated line, protocols, reporting effort and first improvement question |
| P04 | Signature verifier, SBOM/notices, migrations, exact-image checks and open-gate notes | Maintainer-controlled Ed25519 key, independently distributed fingerprint, signed candidate and verification with that trusted key |
| P06 | Baseline measures and milestone review protocol | Pilot compares commissioning/reporting effort, unresolved stop reasons and usefulness with the baseline; recorded backlog decisions |

## Pilot record and execution

Use the [S7-1500 guide](S7_1500_PILOT.md), [compatibility contract](COMPATIBILITY.md),
[capacity procedure](CAPACITY.md) and [interview guide](RESEARCH_DECISIONS.md).
Record the following before connecting a physical endpoint:

- Site/line, responsible operator/engineer/production lead, approved read-only scope
  and interruption window. Keep private contacts outside the public repository.
- Application commit/image, database/runtime versions, OS/CPU/RAM/storage, browser,
  operator-device/display model, screen size and viewing distance.
- Device/firmware/gateway/server/licence, verified public certificate fingerprints,
  profile/mapping revisions, units/scales/states and counter rules. No passwords or keys.
- Machines/tags/rates/users/exports/history size, retention and outage budget. Choose
  operating limits after measuring, not from simulator throughput alone.
- Baseline reporting/setup minutes, unclassified stop minutes, independently observed
  counts/downtime and the first improvement question.

For every approved scenario record times/timezone, expected and actual observations,
quality/gaps, evidence-file SHA-256, software/profile revision, defect/limit, reviewer
and decision. Include run/stop, good/reject counts, reset/rollover, bad/missing/stale
readings, duplicate delivery, type change, reconnect and certificate renewal.
Interrupt equipment only within the owner's approved scope; otherwise leave the
scenario unexecuted. Replay cannot recover unreceived samples.

Reconcile a complete shift with the independent ledger and resolve discrepancies.
Rehearse restore in isolation before reconnecting a real endpoint. For user sessions,
capture completion/time/errors and consented observations. For maintenance, record
true/false positive/negative counts and the exposure period. For recommendations,
record the list used, accepted/dismissed action and observed outcome.

The process owner records accepted scope, rejected scope, unresolved defects,
operating limits and the next review. Attach receipts to each TODO item before
checking it off. Browser automation cannot substitute for interviews or approval.

## Two reopened acceptance items and other deployment gates

U06 and X04 are reopened in TODO: their software is implemented, but their full
Done criteria are not met. U06 needs a person using NVDA/VoiceOver, text zoom and focus-obscuring checks
on the actual device ([checklist](ACCESSIBILITY.md)). X04 needs actual pilot-run
forecast backtests. E02 needs the customer's identity provider; H08/E03 need the
real site network; I03/I04 need ERP/CMMS vendor acceptance. Recipes, batches and
compliance remain experimental, with no regulatory-validation claim. Checked IDs
close their documented software scope only. Rejected I08/E06/X02 and withdrawn
I06 are not outstanding implementation requests.

## Candidate handoff

Keep the commit/image, complete dependency/container scans, CI/local receipts,
migrations, release notes and compatibility list outside disposable worktrees.
Label the candidate **unsigned — publisher trust pending**. Follow
[releasing](RELEASING.md) when the maintainer supplies the trusted public key;
a temporary test key is never the publisher's identity.
