# Factory-pilot software acceptance — 2026-10-26

The nominated pilot family is **Siemens SIMATIC S7-1500**. All evidence below uses
owned simulators, isolated databases and disposable container installations. Exact
CPU order number, firmware, OPC UA licence/settings, tag semantics, approved load
and supervised physical acceptance remain open.

| Software milestone | Delivered scope | Focused evidence |
| --- | --- | --- |
| Secure onboarding | Encrypted machine credentials, password/X.509 sessions, explicit trust, expiry/hostname checks, redacted preview | `59ed0107`; `test-secure-machine.mjs`, credential/storage unit tests |
| Installation and recovery | Isolated preview, complete image/DB/file backup, fresh restore, checked upgrades and failed-upgrade rollback | `4dae187d`; `test-operations.mjs`, `test-capacity.mjs` |
| Operator and supervisor workflow | Attributable handover/actions, reviewed manual quantities, current job/progress, restricted wallboard | `01ef65e0`; `test-operator.mjs`, signed socket/role tests |
| Unattended operation | Durable scheduled jobs/catch-up, PDF/email retries, persisted alarm holds/hysteresis, collector/data incidents | `e7311ae0`; `test-report-jobs.mjs`, `test-unattended-alarms.mjs` |
| Legacy gateway | Read-only 03/04 reference adapter, encrypted loopback OPC UA, owned two-unit fixture and reusable profile | `a876d9a0`; `modbusRead.test.ts`, `test-gateway.mjs`, actual-image runtime smoke |
| Incident replay | Bounded signals, clocks/quality/gaps, alarm transitions, operator revisions, later stop annotations and export | `664e480a`; `incidentReplay.test.ts`, `test-incident-replay.mjs` |

The final identity-recovery fix (`5178ebd9`) refuses to silently replace an
incomplete certificate/key pair. Fresh installation and deliberate renewal remain
available. Timestamp validation also rejects offset-free production times before
normalization, and successful connections now release their timeout timer.

## Local validation

- **153 server + 67 client unit tests**, with coverage gates passing.
- Both builds, client type checks, formatting and lint: zero errors; 22 existing
  documentation warnings. Migration generation reports no schema drift.
- **12 existing browser tests** against a newly created isolated database, plus
  the extended production browser/API suite covering every milestone above.
- Fresh/repeated migrations, full-window trends, same-key isolation, raw scalar
  precision, provenance, database outage, forced termination, atomic capacity
  failure, tracing and development dependency checks pass.
- The actual Node 24/Wolfi image passes encrypted OPC UA/gateway read/write-denial,
  SQLite/bcrypt, offline email/PDF, automatic reports, persisted report restart,
  non-root operation, timezone handling and durable crash/outage replay.
- Complete operations rehearsal upgrades the earlier image
  `sha256:87459d4b54c527910a7404cb975d9ac68444d36da0819560b9cd8b53ebff0d45`
  to the current image, preserves encrypted credentials/key, pending spool,
  gateway configuration/PKI files and PDF, checks database readiness failure,
  rejects tampering/overwrite, stops a failed upgrade and restores its checkpoint
  into a fresh instance. Explicit activation is tested separately from preview.
- [Capacity](CAPACITY.md) records 6,200 persisted samples, 64 preserved unknowns,
  ten concurrent query clients and a 1,000-row export; this is a synthetic burst.

The local runtime image for source `5178ebd98196f15fc551e29b712788f70e1b59bd` is
`sha256:d28ae1ebc6e7308f5022c3bf2d8970a13adb2fbbd3ea290008c1a09f72af9b85`.
Its unfiltered Trivy 0.76.1 scan reports **zero findings**, covering **28 Wolfi and
556 Node packages**. The full npm audit reports **zero advisories**. Hosted builds
must pass their own exact-revision CI and retain their own image identity; this
local receipt does not certify a different build.

## Boundaries retained

These are bounded software milestones, not closure of the entire roadmap. Separate
companies still require separate installations. Hardware acceptance, sustained PLC
capacity, customer restore drills, production email-provider delivery and independent
deployment review remain distinct. SMTP delivery is at least once and can duplicate
after an ambiguous acceptance/crash. Missing measurements cannot be reconstructed.
Replay does not prove causation; the legacy fixture does not emulate Siemens.

See [S7-1500 pilot](S7_1500_PILOT.md), [operations](OPERATIONS.md),
[operator workflow](OPERATOR_WORKFLOW.md), [unattended operation](UNATTENDED_OPERATION.md),
[legacy gateway](LEGACY_GATEWAY.md) and [incident replay](INCIDENT_REPLAY.md).
