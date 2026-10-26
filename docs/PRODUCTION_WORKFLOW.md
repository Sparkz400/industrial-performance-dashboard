# Production shift workflow

This is a tested software workflow for an owned OPC UA simulator and one company.
It does not qualify a physical machine, a protected user identity or a production deployment.

## Commissioning

Open **Production shift → Commission machine** as an administrator. Select an
existing machine or add its exact endpoint. Check the connection, then map state,
total, good and reject signals by namespace URI and identifier. Namespace indexes
are resolved against the selected endpoint during preview and save.

For the bundled simulator, use **Use owned simulator example**. Its deterministic
60-second scenario runs for 40 seconds, idles for 10 and faults for 10; it produces
one part every two running seconds, with every tenth part rejected. The example
is a demonstration, not a universal machine profile.

Preview shows actual values, types, quality and source time. Review state meanings,
units, scale, ideal cycle and counter-decrease policy before saving. Saving checks
the endpoint again, stores an immutable profile revision, configures collection
and creates a trend dashboard. Other mappings are preserved; conflicting aliases
are rejected. Saved profiles can be reused or exported/imported as JSON; import
validates and previews configuration before any application change.

Only anonymous OPC UA sessions and the listed scalar types are implemented here.
No browsing of arbitrary networks or writes to equipment occur. An unencrypted
channel is suitable only for the owned local demonstration. Certificate/user
identity qualification remains C01/C02. Profile units and model/version text are
operator declarations, not automatically verified vendor compatibility.

## Shift and operator workflow

Create a shift with an explicit start/end UTC offset, IANA site timezone, work
order, product, optional target and planned breaks. Windows may cross midnight
and DST; elapsed UTC time controls the calculation. The maximum window is 48 hours.
Overlapping shifts for the same machine and overlapping/out-of-window breaks are
rejected. Recurring calendars, holiday rules and multiple product runs remain open.

The shift copies the profile and cycle standard. Later profile edits do not rewrite
it. Collection includes a read heartbeat every ten seconds; values without a fresh
observation within the profile's maximum gap become **unknown**. Bad quality,
unrecognized state values and different source identities also remain unknown.
Unknown is never treated as a stopped machine or a reason to infer production.

Select an observed idle/fault/planned interval to classify its reason. Viewers may
acknowledge alarms and classify/correct stops; other application changes require
an administrator. Corrections append a record with actor, time and predecessor;
they do not delete the original reason or machine timeline. Narrow a correction
and add another non-overlapping reason to split an interval. Running, unknown,
future and overlapping reason intervals are rejected.

The report includes state intervals, observed quantities, loss reasons, coverage,
OEE inputs and issues. Counters use their declared decrease policy. No delta that
crosses an unsampled boundary or a quality/freshness gap is invented. Incomplete
counters show observed deltas with a warning. Factors above 100% stay visible.
Availability is unavailable when state coverage is incomplete. Planned exclusions
and input signals are disclosed. Running during an excluded break withholds
performance/OEE and asks for a schedule correction. The report is bounded to 100,000 samples per signal.

An administrator can record independent total/good/reject counts and their source
reference once. Missing coverage, unclassified stops, inconsistent quantities,
factor anomalies and mismatches prevent a verified label. A verified fixture does
not establish physical-machine qualification. Export JSON includes the original
reason history and profile; **Print shift report** provides a printable overview.
Reports are recalculated from the current retained measurements; immutable report
archives and late-arrival revision handling remain R04.

## Alarm and delivery contract

One evaluator serves both alarm APIs and tRPC. It consumes the durable measurement
spool after PostgreSQL insertion and before spool acknowledgment. A transaction
records the incident transition, rule/machine cursor, unique event receipt and
pending webhook deliveries. Retries and equal-timestamp replay do not duplicate
incidents. A failed transaction cannot consume a cooldown or event receipt.

Rules are evaluated per observed machine, including all-machine rules. Existing
condition vocabularies are supported; `range` means outside the bounds. Change
rates use actual source elapsed time and a maximum gap. A first sample or a bad
predecessor cannot establish a change rate. Bad data suspends evaluation and marks
an existing incident's input unknown. Acknowledgment records the signed-in actor;
only a subsequent good, non-triggering measurement resolves the incident.
Manual clear/resolve returns 409. Plant-scoped legacy rules are not evaluated
because plant-to-machine authorization is not implemented; migrate them to an
explicit machine or an all-machine rule. Rules are applied as configured when
processing resumes; historical configuration revision replay remains unqualified.

Configure **Settings → Webhooks** for `alarm.triggered` and `alarm.cleared`.
HMAC-SHA256 signs the exact JSON body in `X-Webhook-Signature`. Persisted delivery
IDs are sent in `X-Webhook-Delivery-Id`; receivers **must deduplicate** that ID.
Delivery is at least once: a receiver can commit before its response is lost.
Failed deliveries retry with exponential delay capped at 15 minutes; inactive
destinations retain pending deliveries. Attempts and last status are available
at the administrator-only `/api/v1/webhooks/deliveries` endpoint. The test button
is separate from actual alarm wiring. Email, Slack, Teams and SMS channel delivery
is disabled; old records remain, with secrets excluded from responses. Other
previously advertised webhook event families are not implemented. Existing
`alarm.resolved` subscriptions must be changed to `alarm.cleared`.

## Permissions and failure behavior

REST and tRPC check the current active account and its session version. A role,
account or password change invalidates earlier sessions. Sessions last at most
two hours on each socket. Logout/account changes disconnect local sockets;
store/account revocations performed elsewhere are checked at most every second.
Incoming socket actions revalidate the session and ignore client-supplied actors.
Metrics, infrastructure settings and legacy scheduled-report distribution require
an administrator. Viewers read this company's data, including its shift reports;
there is no per-machine or tenant isolation. Use separate installations for companies.

Public shares and embeds return 410 and new sharing is disabled. Existing tokens
are retained for administrator revocation. Selected-data sharing remains F08;
do not enable it by bypassing authentication on measurement routes.

The spool reserves 64 MiB of free storage and caps its backlog at one million
measurements. Reserve/capacity/write failure stops acquisition before broadcast;
restore storage and restart the collector. Already durable events remain queued.
The production workspace shows the backlog and storage failure; unreceived time
remains unknown. Keep the spool on persistent local storage and run one collector.
Database outages delay alarm evaluation and delivery; this application is not a
real-time safety alarm system. PostgreSQL/history/outbox retention and complete
backup/restore qualification remain deployment work.

## Repeatable evidence

With the owned PostgreSQL service on loopback port 55432 and the built server:

```sh
npx playwright install chromium
node scripts/test-recovery.mjs
node scripts/test-production.mjs
```

Both scripts create and remove their own databases and temporary files. Recovery
tests force termination of owned child processes, interrupt a real database
connection and exercise real SQLite `SQLITE_FULL` with a page cap; they never fill
the host disk. The production script launches its own browser, application and
OPC UA endpoint, verifies negative permissions, commissions through the UI, creates
an alarm rule through the UI, receives signed events, retries a failed receiver,
and reconciles a hand-calculated shift ledger. Screenshots and the printed fixture
are retained in ignored `.local/production-evidence/`. CI publishes this evidence.
