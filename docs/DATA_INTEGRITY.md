# Data integrity and reviewed operations

This software wave implements H03/H07/H10/U09/I04/M05 in a separate checkout
from the PR #63 endurance run. It adds no machine writes. Physical-machine,
vendor, billing and 72-hour qualification remain separate acceptance gates.

## Dashboard readings

Legacy uptime and operation-mode widgets now use commissioned state observations
instead of generated values. Uptime is the observed running fraction of the
UTC day across the latest seven days; uncovered time remains unknown. State durations use the current
commissioned profile's state mapping and maximum gap. A missing profile does not
imply uptime.
Air, state, OEE, batch and SPC widgets preserve missing/bad/stale values and valid
zero. Historical charts use actual timestamps and visible gaps. Source and receive
times, quality, coverage and correction revisions remain available in evidence.
SPC remains experimental; these display changes do not qualify its statistics.
SPC history exposes source evidence, truncation and unknown continuity; recorded
violations remain historical decisions when raw projections are corrected.
System health expires after 90 seconds and failed reads clear the healthy display.
Alert summaries label their latest-five sample instead of presenting it as a total.
Batch and OEE views disclose their available quality/coverage evidence and explicitly
identify unavailable provenance.

## Late data and measurement corrections

Operations → History → Measurement corrections lets a supervisor or administrator
find up to 200 retained measurements in a window of up to 48 hours. Select a row,
enter a numeric value or mark it bad, provide a reason, preview potentially affected
shifts, then explicitly confirm. A preview expires after 15 minutes and is bound
to its reviewer, machine, source row, expected revision and requested change.
Concurrent changes require a new review. Permission and account changes are rechecked
under the transaction's user lock, including requests that waited for another writer.
Repeating the same request returns its
existing receipt; reusing its identity for a different change is refused.

The transaction appends the full before/after audit evidence and updates only the
numeric projection, effective quality and correction revision. Raw values, event
identity, source/acquisition/receive timestamps and signal identity stay unchanged.
The preview shows the actual numeric storage precision. Boolean corrections are
zero/one; text cannot be converted into a numeric measurement. Source quality is
stored separately from the manual effective quality. Audit APIs provide no edit
or delete operation; this is not a database administrator tamper-proof claim.

Current calculations read the corrected projection. Frozen shift report revisions
and previously recorded alarm/SPC decisions remain unchanged. A newly reviewed report
revision includes a measurement digest, correction count and late-arrival count.
Reports identify lateness as reception more than five minutes after event time;
lateness alone does not invalidate source quality. New data uses event-time order
with the database row ID as a deterministic tie breaker, and existing durable
event identities continue to prevent duplicate replay. Corrected source rows are
excluded from retention. Shift source protection includes a one-hour lookback.

New ingestion preserves future-clock raw evidence but gives it bad effective
quality and no numeric projection if acquisition or source time is more than
five minutes after reception. Invalid timestamps are refused before spool
acknowledgment. Manual correction cannot turn an identified future-clock row good.
Legacy rows without receive evidence retain unknown clock status.

Hourly history summaries combine retained summaries with currently stored raw
rows, including late arrivals, without counting deleted rows twice. Numeric
summaries require finite, good values and consistent known signal identity.
The aggregates endpoint reads current raw projections; it does not reconstruct
deleted raw data. Raw exports include correction revision and both quality fields;
aggregate exports include corrected-sample counts and signal identity status.
Unknown continuity remains explicit. Corrections to already-deleted raw rows are
not supported, and corrected evidence consumes storage until an explicit future
archival policy is introduced.

## Calculated signals

Operations → Calculated signals creates immutable named definition versions from
measured inputs on the selected machine. The builder supports bounded arithmetic
and declared units; the API accepts at most 32 expression nodes, depth 8 and eight
distinct inputs. There is no executable script, filesystem access or network
operation in an expression. Addition/subtraction require compatible units;
supported scale conversions include Wh/kWh, W/kW and L/m³. Units are reviewed
declarations, not automatic physical calibration.

Evaluate a selected version over a past window of up to 48 hours and 10,000 source
samples. Missing inputs, changed identities, bad quality, stale values, invalid
clocks, division by zero and overflow produce unknown results. Replay includes
the exact definition, measurement identities, correction revisions and evidence
digest; exports preserve that input evidence. New corrections may change a fresh
evaluation, while a previously exported replay remains an explicit snapshot.
Calculated values are not automatically substituted into production KPIs or alarms.

## Offline operator drafts

An already signed-in operator can explicitly retain a note, action or quantity
declaration on this device when connectivity is lost. Cached observations are
labelled stale. At most 20 drafts are retained for 24 hours per account, with
machine identity and stable request identity. Reconnection sends nothing by itself.
After reconnecting, refresh and review the current server entry, confirm, and send.
Changed server revisions are refused; discard the stale intent and edit the current
entry. A lost response can be retried without duplicating notes or declarations.

Logout, account changes and detected authorization revocation clear protected
drafts across tabs. Failed offline logout retains a local intent so reconnect/reload
cannot automatically expose the former session. A reload still requires verified sign-in before exposing retained drafts.
There is no offline login or machine control. Browser storage is local persistence,
not encrypted shared-device storage; use the normal logout flow before changing
operators. Draft expiry cannot reconstruct unsaved work or measurements never received.

## Reviewed CMMS handoff

An administrator configures an existing protected webhook destination and explicitly
subscribes it to `cmms.handoff`. In Operations → Maintenance actions, a supervisor
or administrator selects an action, reviews the payload and either downloads the
vendor-neutral contract or confirms submission to the configured destination.
The signed review binds actor, machine, action version, contents and destination.
No free-form remote URL is accepted in the handoff form.

The durable handoff and webhook delivery are created together. Retries retain the
same handoff/event identity; repeated submission of an action to the same destination
returns the existing handoff. The receiver must persistently deduplicate that identity
before creating a work order. The owned test receiver exercises lost-response/retry
deduplication; an HTTP success alone cannot prove a vendor created exactly one order.
Changing a reviewed destination blocks pending delivery. Deactivate a destination
with handoff evidence rather than deleting its history. A vendor-specific adapter,
its field mapping and remote permission acceptance still require a named target.

## Energy cost and emission estimates

Operations → Energy accepts versioned, non-overlapping tariff periods with an
explicit currency, price per kWh, optional kg CO₂e per kWh and source reference.
Changes append a version and reject stale schedule revisions. The estimate uses
observed cumulative-meter deltas and records meter/tariff versions, corrected
sample counts and an input digest.

A meter delta spanning a tariff boundary stays unpriced because its within-interval
allocation is unknown. Missing measurements, invalid/reset counters, gaps or absent
emission factors never become zero. Observed partial costs are separate from a
complete-period estimate. Multiple currencies are not converted. Taxes, standing
charges and demand charges are excluded. These are user-factor estimates, not bills
or certified emissions statements; imported tariffs and calibration need independent
review before operational decisions.

## Verification

Run both workspace builds, client type checking, lint/format checks and the unit
suite, then these isolated owned-database and real-browser fixtures:

```powershell
node scripts/test-measurement-corrections.mjs
node scripts/test-signal-quality.mjs
node scripts/test-offline-operator.mjs
node scripts/test-maintenance-costs.mjs
```

They cover permissions/revocation, conflict/idempotency behavior, retained evidence,
unknown-data boundaries, actual submissions/downloads and English/German narrow
layouts. The CI browser job runs these alongside the existing workflow regressions.
Sanitized JSON and PNG receipts are written under `.local/daily-evidence`; private
fixture databases, cookies and keys are not public artifacts. Exact validation
results and the commit under test are recorded in the pull request.

### Local checkpoint validation — 2026-10-28

- 332 unit tests passed: 226 server and 106 client, with configured coverage gates.
- Shared/server/client builds, client types, lint (zero errors; 11 existing warnings),
  formatting, Storybook, migration generation without drift, release-signature and
  development-dependency checks passed.
- All four new owned-database/browser fixtures passed, including permission changes
  while a write waits for a lock, and English/German at 390 pixels.
- Fourteen existing regression scripts passed, including the isolated 15-test
  browser suite and the 200,000-row history/export/retention fixture. The history
  fixture served 271 concurrent queries while ingesting 271 new rows, with 268 ms
  observed p95 query latency on this host; this is a test observation, not a capacity SLA.
- Owned fixture processes exited and their isolated databases/temp directories
  were cleaned up. Screenshots were inspected; source evidence tables scroll
  horizontally on narrow screens.

The foundation at `63cb87fdf1a38fb9f424f8cf7a017a019370a614` separately passed all
ten hosted checks and a four-cycle recovery smoke with 312 exactly-once checkpoint
replays and successful cleanup. That short run is not 72-hour acceptance and does
not qualify this new feature revision. Exact-head CI and the existing endurance
merge condition remain separately recorded gates.
