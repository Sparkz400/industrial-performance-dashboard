# Daily factory workflows

This wave implements TODO DF01–DF04, DF06 and DF07 for Performance Dashboard as an
independent product. Start with **Daily operations** in the sidebar and choose a
machine. Setup and account administration remain under **Settings** and **Machines**.
The controller pilot remains S7-1500; no physical-machine acceptance is implied.

## Accounts and visibility

| Role | Granted machines and dashboards | Production actions | Planning, maintenance setup, energy | System administration |
| --- | --- | --- | --- | --- |
| Viewer / wallboard | Read | No | Read | No |
| Operator | Read | Acknowledge, classify stops, notes/actions/count declarations, inspections | Read | No |
| Supervisor | Read | Operator actions plus reviews/reconciliation | Configure, publish and save revisions | No |
| Administrator | All | All | All | Yes |

In **Settings → People & Access**, assign direct machine grants or active site
membership. A machine can belong to one site; grants are the union of direct and
site access. Dashboards require an explicit nonempty asset list and access to
every listed machine. Keep that list consistent with its widgets. Other management
and experimental modules are administrator-only. Separate companies still need
separate installations: this is asset/site authorization, not tenant isolation.

REST, individual tRPC calls, exports and socket subscriptions enforce the current
account and asset scope. Grant changes invalidate existing non-administrator
sessions, including streamed exports; socket revalidation also runs every second.
The browser clears account caches and signs out after revocation. Recovery mode
remains read-only. New routes default to administrator-only until explicitly scoped.

**Upgrade:** migrations preserve existing read visibility by granting existing
non-administrators existing machines, and associating existing dashboards with
existing machines. Review those assignments after upgrade. New accounts and newly
created machines receive no implicit grants. Existing viewers become strictly
read-only; assign **operator** explicitly to people who need production actions.
The wallboard creation flow grants its selected machines to the new display account.

## History, storage and retention

History exports stream a repeatable database snapshot in batches of 1,000 rows;
three exports may run concurrently. Slow/disconnected readers, expired accounts
and fifteen-minute jobs release their database cursor. A statement has a thirty-second
timeout. Select a smaller window when those bounds are reached.

The default CSV is **long-form raw history**, one row per measurement:
`id,timestamp,nodeKey,value,rawValue,statusCode,dataType,sourceTimestamp,receivedAt,signalMetadata`.
This replaces the old wide numeric CSV. Consumers should use the header, preserve
quality/provenance and distinguish null from zero. String formula prefixes are
escaped for spreadsheet safety; numeric negative values remain numeric text.
An explicit `downsampleBucketSeconds` produces bounded, quality-aware aggregates
with sample/good counts and status; there is no automatic export downsampling.

Administrators can configure retention days, **Preview removal**, inspect the exact
cutoff/count, confirm a backup, then apply the reviewed preview. No policy deletes
data automatically. Previews expire after an hour and are bound to their author,
policy version and maximum observed row ID. Concurrent late-arriving historical
rows cannot enter an already reviewed deletion. Each transaction summarizes and
deletes at most 5,000 rows; retries cannot double-count removed samples.

Raw evidence for recorded production shifts and current active maintenance
intervals is protected, including boundary lookback. Protected history can therefore
keep growing beyond the retention age. Hourly summaries describe removed rows only;
do not add them to an overlapping raw query without a disjoint-range policy.
Missing/mixed source identities or bad samples suppress an aggregate average.

For signals in the machine's commissioned production profile, retention also keeps
what an average would lose: seconds per production state (running, idle, fault,
planned) and counter increments with the profile's gap and reset/rollover rules,
exactly as the shift report calculates them. Each removed reading keeps the state
interval or counter pair that starts at it, so rows that stay stored never double-count;
state time is split by hour and a counter increment belongs to the hour of the later
reading. Bad, unmapped or out-of-gap data is not stored and stays unknown (the rest of
the hour). The summaries API returns these as `retained_state_seconds`,
`retained_increment`, `retained_increment_pairs` and `retained_unknown_pairs`.
Individual transitions, raw counter values and report evidence are still not
reconstructable (`test-history-rollups.mjs`).

Storage shows database/history allocation, measured row size and recent receipt
rate. The thirty-day growth forecast estimates **row bytes only**; indexes, free
disk, compression and future workload are not inferred. Monitor actual host free
space separately and retain the collector's configured disk reserve.

## Calendars, product runs and frozen reports

Calendars define weekdays, holidays, an IANA timezone, local start, elapsed duration,
break offsets and a default job. Preview at most ninety days before publishing.
Nonexistent daylight-saving start times are rejected; repeated times require an
explicit earlier/later choice. Duration is elapsed time, so a wall-clock end may
change on a daylight-saving transition. Publishing is transactional, rejects
overlaps and is repeat-safe. Calendar edits do not rewrite published shifts.

Assign up to thirty non-overlapping product runs inside a shift. Each has its own
job/target and ideal cycle. Counter evidence is clipped to each run; missing boundary
samples remain uncertain. Performance combines each run's actual count and cycle
standard only when running time is assigned and counters are complete. Running
during an excluded break remains unresolved until the plan is corrected.

Commissioning supports reject-decrease, declared reset-to-zero and declared rollover.
Rollover requires an exclusive modulus and a transition from the top ten percent to
the bottom ten percent. Mid-range resets and out-of-range values stay unknown.
Multiple wraps or a reset near the wrap point cannot be distinguished from samples
alone: qualify the sampling interval and source behavior on the actual machine.

**Save report revision** stores a consistent immutable JSON snapshot of the profile,
plan, calculations and energy evidence, actor/time and canonical SHA-256 digest.
Later plan edits do not change the saved revision. Download a revision for review;
a digest detects changes to that snapshot, not whether the machine data was correct.
Every revision after the first needs a reason. **Check reproducibility** regenerates
the report read-only and either confirms it matches or names the changed sections with
recorded causes: later measurement corrections, late arrivals, changed quantity
declarations, plan changes or retention in overlapping hours. The saved revision never changes.

## Maintenance

Create a service plan with calendar days, runtime hours, cycle count or a combination,
and a required inspection checklist. Runtime/cycle totals use the snapshotted profile
and quality/identity checks. An observed threshold can establish that service is due;
gaps prevent a confident not-due result. Plans show partial observations explicitly.

Operators record checks, a note and an optional incident from the same machine.
An inspection can record failed checks without resetting intervals. Completing service
requires every check to pass and starts the next interval. History is attributable
and append-only; request IDs make retries idempotent and versions reject stale edits.
Editing plan settings does not reset usage or replace the original signal profile.

## Energy and losses

Configure a cumulative Wh/kWh meter with identity, scale, maximum sampling gap and
optional declared rollover. Only valid consecutive intervals contribute measured
energy. Unknown gaps/resets are not estimated. Idle energy requires the whole meter
interval to be known idle; intervals crossing states remain unassigned.

Energy per good part requires complete energy coverage and a complete positive good
count. Ranked downtime shows classified measured intervals; unknown time is separate.
Changeover is an explicit stop-reason category. Supervisors can attach an independent
meter reading, tolerance and reference after a shift ends. This evidence is insert-once;
reconciled means complete coverage and agreement within that stated tolerance.
Saved report revisions include the energy configuration, result and reconciliation.

## Interface and scope

English/German selection persists locally and keeps in-progress form values. Core
navigation, login, dashboard, alerts, production and daily workflows are translated;
specialist/experimental modules and server diagnostic messages can still use English.
Numbers, percentages and dates follow the selected language (for example `1.234,5` and
`43,3 %` in German). Units are shown exactly as stored; nothing is converted. Daily
operations has a searchable machine picker and remembers each account's last machine
and tab in this browser; a machine whose grant was removed is not restored.
Stale, bad-quality, disconnected or overdue live state displays as unknown. Focused
navigation keeps advanced modules separate; read-only dashboards hide editing controls.
The widget gallery and image-export code load when requested. Coarse-pointer targets
are at least 44 pixels, with focus outlines and a skip-to-content link.

Automated acceptance covers actual keyboard, mobile/touch and language-switch flows.
It is not a complete screen-reader audit or an operator sign-off on a factory display.
See [validation evidence](DAILY_OPERATIONS_ACCEPTANCE.md) and [capacity](CAPACITY.md).
