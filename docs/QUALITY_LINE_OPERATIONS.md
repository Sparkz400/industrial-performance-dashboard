# Quality, line losses and unattended operations

These workflows are evaluation software. Advanced quality, line configuration,
SPC approval and alarm-action screens currently require an administrator. Existing
machine-scoped operator service inspections remain available under their existing
permissions. The new forms are in English. Hardware capacity, process stability,
site acceptance and multi-day reliability remain separate qualification gates.

## Batch quality and genealogy

Enable the existing `COMPLIANCE_MODE_ENABLED=true` server setting for Recipes and
Batches. Apply migrations, including `0015_quality_evidence`, before starting the
new server. A newly created batch stores its own recipe name, version, parameters
and setpoints. Later edits or deletion of the source recipe do not change those
limits. Historical batches are not backfilled with today's recipe: their old
summaries remain stored, but the API marks them unverified and withholds them.

Batch windows are `[startedAt, completedAt)`. Means/minima/maxima use only finite,
Good-quality numeric values. Missing results are `null`, not zero. Empty recipes,
missing parameters or excluded readings give unknown overall compliance. Genuine
zero readings remain zero. The parameter status compares the observed good-sample
mean with the frozen tolerance; it is not an item-level yield or release decision.
Good/excluded sample counts accompany every parameter. Raw values and status codes
remain available in time series; unusable numeric chart points are gaps. The live
value uses the latest reading, including an unknown result, and its status uses
the frozen target and tolerance rather than an assumed percentage.

The batch dialog records attributable pass/fail/unknown inspections. Failed
inspections require a defect reason. A rework action belongs to one failed
inspection, has an owner/deadline, and closes only with a newer passing inspection
of the same check and at least the same quantity. Inspection request IDs prevent
duplicate submissions; different evidence cannot reuse an ID. Records have no
destructive edit API. These checks do not identify individual pieces within a lot.

Register a produced output lot before consuming it. External input lots need a
supplier reference. Lot names are installation-wide identities; units must agree,
consumption cannot exceed registered output, and cyclic batch genealogy is
rejected under a transaction lock. Trace reports expose links in both directions,
with a 5,000-link truncation flag. These are declared lot movements, not automatic
material reconciliation or supplier certification.

## Reviewed SPC reference periods

The SPC screen prepares a candidate from a selected past window of up to seven
days and 10,000 readings. It freezes the ordered reference readings, their quality,
source interval and a SHA-256 digest. Sample standard deviation and all four
Western Electric rules are evaluated across the ordered sequence.

Approval requires at least 100 usable readings, no excluded readings, positive
variation and no detected rule signals. The reviewer must also supply evidence
and explicitly attest stability, independence and approximate normality. Absence
of rule signals alone does not demonstrate these assumptions. Approval installs
the reference mean and three-sigma limits. Editing a profile invalidates its
capability eligibility; a new approval supersedes earlier baselines.

Cp/Cpk use specification limits supplied separately from control limits. They
describe only the approved reference period, not current-process stability.
The reference tests reproduce the [NIST example](https://www.itl.nist.gov/div898/handbook/pmc/section1/pmc16.htm)
with LSL=8, USL=20, mean=16 and s=2: Cp=1 and Cpk=2/3. Synthetic test approvals
exercise the workflow and are not evidence of a real stable process.

## Production-line investigations

Daily operations → Production line stores versioned-by-creation line definitions:
machines, non-overlapping running/idle/fault/blocked/starved codes, optional cycle
duration and output counter tags, and directed buffers with occupancy tags.
Relationships must be acyclic and reference machines in the line. Save a new
definition when mappings change. Definitions and source data should be retained
with any investigation report.

Reports cover at most 48 hours, 100,000 readings per signal and 200,000 readings overall. Gaps beyond the
configured threshold and non-Good states are unknown. Microstops require a known
short stopped interval bounded by running observations. Consecutive stop reasons
form one stop; unknown gaps never join stops. Adjacent loss totals count each
neighbor once even when it has several connecting buffers. Cycle tags must emit one
duration in milliseconds per completed cycle; p50/p90/p95 describe those observed
cycles. Buffer full/empty counts are observations, not occupancy duration.

Candidates rank observed fault/idle time, then median cycle duration (at least 10
cycles; comparisons require equivalent work per cycle), with adjacent blocked/starved totals
and coverage as supporting evidence. A candidate with under 80% state coverage
is withheld. This is an investigation aid, not proof of causation or a calibrated
line-flow model. Target shortfall is known only for a unique terminal machine
with a complete ordered counter interval; resets, gaps and missing endpoints make
it unknown. Averages of sampled counters are never used as cycle durations.

## Maintenance actions and notifications

Daily operations → Alarm actions links an alarm to an owner, escalation owner,
deadline and intervention. Maintenance suppression has an explicit end within
24 hours. Optional quiet hours are expressed in UTC, including overnight windows.
Both defer durable webhook delivery while alarm evaluation/recording continues.
The UI reports queued delivery failures and repeated alarms.

The health worker escalates overdue actions once, writing the event and marker
atomically. Configure an existing webhook for `maintenance.escalated` (or `*`) to
deliver it to your chosen workflow; assignment itself does not send email to a
user. Without a destination the overdue/escalated action remains visible, but no
external delivery is implied. Escalations are not suppressed by alarm quiet hours.

Completion requires a newer completed service inspection on the same machine.
Its outcome stays `awaiting-recovery` unless the measured alarm resolves after the
linked service inspection. A clearance before service does not demonstrate recovery.
Subsequent episodes of the same rule or health incident mark it `recurred`, including
episodes between the inspection and action completion; `recovered-observed` describes the
observed interval, not permanent resolution. Reassignment and correction workflows
are not included in this first version.

## Storage, late data and reviewed scheduling

History shows measured collector free space and an extrapolation of observed
free-space decline over up to 24 hours. At least one minute of observations and
positive growth are required. Stable/increasing free space yields unknown runway,
not infinity. All writers and cleanup on that filesystem influence the estimate.
The health worker raises a storage incident below two days to the safety reserve.

For database runway, explicitly mount the real database filesystem into the
application and set `PD_DATABASE_STORAGE_PATH` to that verified mount. A remote
database's space cannot be inferred from the collector's disk. Without the mount,
database runway stays unknown. Reserves are 64 MiB for collector storage and 1 GiB
for the measured database volume; they are not a database sizing recommendation.

Late measurements remain timestamped by source and receipt clocks. Newly received
history has a 24-hour retention grace period. Frozen batch summaries can be
explicitly refreshed to include late data; original recipe limits remain frozen.
Current batches, shift evidence and active maintenance evidence are protected.

Retention never schedules itself. An administrator reviews an exact preview and
can apply it immediately or schedule it before its one-hour expiry. The preview
stores exact row identities, as well as count/policy/actor. The worker rechecks
protection, policy, actor and expiry before each bounded 5,000-row transaction.
Rows newly eligible after review are excluded. Expired/changed jobs fail closed;
there is no recurring blanket delete permission. Hourly quality summaries remain,
while raw deletion requires a backup for recovery. Preview membership is removed
after completion or expiry. Scheduled jobs appear in the storage response.

## Reproducible offline distribution

Node.js 24 and Docker Engine with Compose must already be installed on the target.
Build and validate an application image, and have the PostgreSQL image locally:

```sh
docker build -t performance-dashboard:validated .
node scripts/offline-package.mjs create --directory .local/offline-package --image performance-dashboard:validated
node scripts/offline-package.mjs verify --directory .local/offline-package
```

The new directory contains both saved images, their immutable image IDs, installer,
operation tool, instructions and file hashes. It contains no installation secrets
or customer data. Transfer it through a trusted channel. On the offline target:

```sh
node offline-package.mjs install --directory . --project factory-local --destination NEW_INSTALL_DIRECTORY --port 3001
```

Installation verifies hashes, loads the images and uses their exact IDs. It does
not rebuild or download dependencies. It creates a fresh isolated recovery preview
with newly generated credentials. Follow `INSTALL.txt` and the existing operations
guide for activation. The bundle reproduces the packaged image, not necessarily a
bit-identical rebuild from moving base-image tags. It is platform-specific and
does not bundle Docker itself. Hashes detect corruption, not publisher identity.

## Endurance workloads and evidence

```sh
node scripts/test-endurance.mjs --hours 72 --machines 10 --tags 100 --users 5 --hz 1 --cycle-seconds 300 --outage-seconds 30
```

This creates its own labeled PostgreSQL container and spool. It continuously
generates synthetic measurements during live writes and database outages, starts
separate collector processes, replays committed batches before acknowledgment,
restarts the database, checks exact row counts and quality, and exports every row
with bounded memory. It records settings, elapsed time, query latency, memory,
storage and per-cycle receipts under `.local/pd-endurance-*`. Only the owned
container/volume is removed. The latest export and receipts remain. Query users
are concurrent database readers, not signed-in browser users. This tests the
production spool with a dedicated workload table, not the complete OPC UA stack.

The short smoke test is not a 72-hour test. Supported machine/tag/browser-user
limits remain unestablished until representative multi-day runs include the real
collector, transport, alarm load and application sessions on nominated hardware.
Use workload receipts to find regressions, not to infer a universal capacity limit.

`scripts/test-quality-line.mjs` uses the existing isolated daily fixture for real
PostgreSQL migrations, API transactions and browser flows. `scripts/test-history.mjs`
covers 200,000-row exports, concurrent collection, late data and bounded retention.
Unit tests cover unknown/zero/quality semantics, reference statistics, state gaps,
counter resets, quiet-hour boundaries and disk extrapolation. No test authorizes
attaching production machines or changing existing installation credentials.
