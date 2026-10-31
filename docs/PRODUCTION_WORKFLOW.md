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

**Suggest mappings from the information model** browses the server read-only (at most
2,000 nodes, six levels, the Server object skipped) and names the companion
specifications it declares by namespace URI (Machinery, Devices, PackML, Machine Tools,
Weihenstephan). A declared Machinery item state machine yields its
`CurrentState/Number` with **high confidence** and state values from the Machinery 1.04
nodeset (Executing 3 → running, NotExecuting 2 → idle, OutOfService 1 → planned);
NotAvailable (0) stays unmapped because switched off and emergency stop look the same.
Other numeric variables are proposed from their browse names with **low confidence**.
Each proposal shows its browse path, data type, rule and model, and a server without a
standard model is reported as such. **Use** only fills the form: preview, review and save
still decide what is mapped. PackML and Weihenstephan counters are structured or optional
and are not proposed (`test-mapping-suggestions.mjs`).

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

Select an observed idle/fault/planned interval to classify its reason. Operators,
supervisors and administrators may acknowledge alarms and classify/correct stops
on their assigned machines. Viewers and wallboards are read-only. Corrections append a record with actor, time and predecessor;
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

## Machines with limited automatic data

A profile may leave out the state signal, the counter signals or both (**Commission
machine** → *Machine state declared manually*, *Counts declared manually*). Mapped
signals are still read and checked; a profile without any signal is saved without
connecting, the machine stays inactive and gets no signal dashboard.

Operators record a **Manual state interval** in Operator handover: a declared state
(running, idle, fault or planned) over an interval inside a linked shift. Only a
supervisor or administrator can mark it reviewed, as for quantity declarations. Reviewed
declarations fill only time without a usable machine state. Where a declaration
contradicts an observed state the observed state is kept, and where reviewed
declarations disagree their overlap stays unknown; the report names each case. The report
shows the state source (measured, manual or mixed) and the manual minutes, and manual
evidence never lets a report verify. Time no declaration covers stays unknown, so
availability and OEE stay unknown rather than being computed from missing inputs. Live
state, uptime widgets and retention rollups treat a missing state signal as unknown
(`test-limited-data.mjs`).

## MQTT sources

Machines that publish JSON over MQTT are read through **Commission machine → MQTT
sources** (administrators). A source names an `mqtts://` broker, its CA certificate
(pinned; plain `mqtt://` is refused), an optional subscribe-only username and password
(sealed like machine credentials and never returned) and up to 50 mappings. Each
mapping ties one **exact topic** to one signal key with JSON pointers to the value and
to the source timestamp. Wildcards, `$` system topics and keys that already have
another source are refused. The broker's ACL should allow this client to subscribe to
those topics only and to publish nothing.

The collector holding the collector lock subscribes with QoS 1 and a persistent session
(MQTT 3.1.1) and never publishes. A message is acknowledged to the broker only after its
readings are in the durable spool; if storage fails, the broker redelivers it. Each
reading's identity is derived from source, signal, source time and value, so a
redelivered or repeated message is stored once, in the spool and in PostgreSQL. Late
readings keep their source time. A message without a readable source timestamp, a
non-JSON payload, a payload over 16 KiB or an unmapped topic is refused and counted
(no time, no sample); a missing value or one of the wrong type is stored as a bad sample. Time without
messages stays unknown. The status line shows connection state, readings received,
refused messages and the last refusal. Sparkplug B is not decoded
(`test-mqtt-ingestion.mjs`).

## Inspections of a shift's products

Supervisors keep an inspection plan per product and machine (append-only; the latest
applies). Under a selected shift report, operators record manual inspections of the
shift's job or product runs: product, check, pass/fail/unknown, parts inspected and, for
a failure, a defect reason. A **reinspection after rework** of a failed inspection moves
passing parts from failed to reworked, so a reworked part never counts as both scrap and
output; at most the still-failed parts can be reinspected. A **correction** supersedes one
current record with a reason and keeps the original; a failed inspection is corrected only
after its reinspections. The summary per product and check lists planned checks without
any inspection. All of it is labelled manual inspection evidence and kept apart from
machine counts (`test-job-inspections.mjs`).

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
HMAC-SHA256 signs the exact JSON body in `X-Webhook-Signature`. The body carries the
persisted delivery `id` and `schemaVersion`; the ID is also sent in
`X-Webhook-Delivery-Id` and receivers **must deduplicate** it. Delivery is at least
once: a receiver can commit before its response is lost. Failed deliveries retry
with exponential delay capped at 15 minutes. After 100 failed attempts (about a day,
including while a destination is inactive) a delivery stops retrying, an incident
opens and an administrator can inspect and requeue it under **Settings → Webhooks**.
Attempts, last status and error are available at the administrator-only
`/api/v1/webhooks/deliveries` endpoint; see the
[integration contract](INTEGRATION_API.md#outbound-events-webhooks). The test button
is separate from actual alarm wiring.

An **Email** destination (same screen) sends alarm mail through the server's
`SMTP_*` settings; credentials stay in the environment, never in the database. It takes
recipients and `alarm.triggered`/`alarm.cleared` only. Any destination can be limited to a
lowest severity and to listed machines. Email uses the same outbox: retries,
dead letters, requeue and maintenance quiet hours apply, and the delivery ID is the
Message-ID, so every retry is the same message. An unreachable or refused mail server
shows as the delivery's last error (`test-alarm-email.mjs`). The legacy Slack, Teams
and SMS channel records remain disabled, with secrets excluded from responses. Other
previously advertised webhook event families are not implemented. Existing
`alarm.resolved` subscriptions must be changed to `alarm.cleared`.

## Permissions and failure behavior

REST and tRPC check the current active account and its session version. A role,
account or password change invalidates earlier sessions. Sessions last at most
two hours on each socket. Logout/account changes disconnect local sockets;
store/account revocations performed elsewhere are checked at most every second.
Incoming socket actions revalidate the session and ignore client-supplied actors.
Browser socket origins must match the configured application origin; an untrusted
origin cannot use a signed session cookie. State-changing HTTP requests require
the matching session CSRF token, including tRPC mutations.
Metrics, infrastructure settings and legacy scheduled-report distribution require
an administrator. Direct machine grants and active site memberships scope read and
write paths, including tRPC, sockets and exports. Dashboards require all their listed
assets. See [daily operations](DAILY_OPERATIONS.md) for the role matrix and migration
behavior. Use separate installations for companies; tenant isolation is unqualified.

Public access is limited to administrator-created links to selected trend widgets.
They expire within 30 days, store only a token digest, re-check revocation and the
creator on every request and never bypass authentication on measurement routes.
Tokens from the retired unscoped design stay unusable. See the
[sharing contract](SECURITY_BOUNDARIES.md#selected-data-links-f08).

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

## Portable calculation evidence

**Export reproducible evidence** downloads the current shift's calculation inputs
and quality metadata from one database snapshot. Follow [offline reproduction](SHIFT_EVIDENCE.md)
for the Node.js checker, privacy review and limits. Partial observed counter deltas
remain visible, but performance, quality and OEE require complete counters or a
reviewed quantity declaration. See the [profile catalog](../profiles/README.md)
for reusable mappings and the [interactive demo](INTERACTIVE_DEMO.md) to try the flow.
