# Unattended reporting and incident monitoring

Use a normal activated installation with persistent database, spool, certificate
and report volumes. Recovery previews pause acquisition, schedules, health checks
and deliveries; see [operations](OPERATIONS.md).

## Reports survive restarts

Each run has a durable history record before a manual request is acknowledged.
Scheduled runs use the schedule ID plus scheduled instant as their unique key.
The schedule cursor advances in the same database transaction as job creation.
Startup and the one-second scheduler poll catch up retained missed slots, up to
20 per pass, without dropping the remaining backlog. A newly created/re-enabled
schedule starts at its next future slot. Changing cron/timezone resets that cursor;
already queued runs retain their saved configuration. Deleting a schedule cancels
its queued, interrupted or retrying runs and undelivered emails. If a worker is
currently generating or delivering a report, deletion returns an explanatory error;
retry after that run finishes. A successful deletion prevents later generation and
delivery even when a worker selected the job earlier. Deleting a template does not cancel jobs
already queued from it.

Jobs snapshot the template, machines, recipients, timezone and period end. The
renderer always uses that saved period, including after a crash. Database advisory
locks prevent workers from processing the same job concurrently. A lost worker
connection releases its lock; incomplete work is retried. Generation has at most
five automatic attempts with delays of 30, 60, 120 and 240 seconds. Interrupted
pre-upgrade jobs without a snapshot are visibly failed and must be run again.

**Report History** separates PDF generation from email delivery. Generation failure
retains its error/retry time; a completed PDF remains downloadable when email fails.
Missing SMTP configuration is **blocked**, not successful delivery. SMTP failures
have their own five-attempt budget and retry times. A completed run with no requested
email says **not-requested**. Administrators can retry failures from history.

Each email retry reuses the existing PDF and Message-ID. If SMTP explicitly accepts
only some recipients, retries include only the remaining recipients. **Exactly-once
email is not guaranteed:** a process/network failure after SMTP acceptance but
before the database records it can result in another delivery. Stable Message-ID
helps diagnosis but does not force a mail server to deduplicate. `sent` means SMTP
accepted the message, not that a person received or read it. Configure and qualify
your own mail relay; test receivers stay on loopback.

The saved configuration and PDF are durable, but measurements are not snapshotted.
Regenerating a failed run may include late-arriving data within its original window.
Published-report revision/retention policy remains separate roadmap work. A crash
may leave a uniquely named `.partial` PDF; it is never published as a completed
download and does not block the next attempt.

## Reduce noisy alarms

Rules expose **Trigger hold**, **Recovery hold**, **Recovery hysteresis** and
**Maximum sample gap**. Zero hold retains immediate behavior. A positive hold
requires good observations spanning the duration on both source and receive clocks.
Bad quality, out-of-order data, a gap exceeding the maximum or a rule edit resets
the pending hold. No new sample means no inferred recovery. Pending state and
event receipts persist across worker recreation; replay does not create duplicate
incidents. Acknowledgment changes neither the measured condition nor PLC state.

A database trigger records every rule version on insert and update, whatever the
write path. A sample received before a rule edit (for example, replayed from the spool
after an outage) is judged by the version in force when it was received; incidents
record that version as `ruleVersion`. A sample no recorded version covers is not
evaluated and is logged rather than judged by thresholds it never met
(`scripts/test-alarm-replay.mjs`). A rule moved to another signal does not replay
samples of its former signal.

Hysteresis applies to greater/less-than thresholds only. For a greater-than rule at
10 with margin 2, a new incident still requires a value above 10; an active incident
does not clear until the value is at or below 8, followed by any recovery hold.
Less-than rules use threshold plus margin. Inclusive comparisons retain their
inclusive boundary. Other condition types reject nonzero hysteresis.

## Collector and data-health incidents

After a two-minute startup grace, the monitor checks every ten seconds. It records
collector storage failures, low disk space (below twice the configured reserve),
a backlog older than `COLLECTOR_BACKLOG_ALERT_SECONDS` (default 60), with unknown
receive times or above 80% of `OPCUA_SPOOL_MAX_ENTRIES`, quarantined measurements,
webhook deliveries that stopped retrying, and a projected disk runway below
`STORAGE_RUNWAY_ALERT_DAYS` (default 2). It also checks the state signal of
commissioned machine profiles. Disconnected, stale,
missing, bad-quality and future-dated signals raise a distinct **Machine data
unavailable** incident. Fresh, identity-matched observations clear that incident.

Machine checks visit six commissioned machines per pass, rotating across larger
installations; detection latency increases with machine count. These incidents use
the existing history, signed-in acknowledgment and durable `alarm.triggered` /
`alarm.cleared` webhook path. Repeated checks update an open incident instead of
creating duplicates. They diagnose observation availability, not a physical fault.

## Collector capacity, quarantine and a second collector

The Production page shows administrators the backlog against its capacity, spool
bytes, oldest pending age, rows written in the last minute and the last database
write failure. Acquisition stops (and never acknowledges a sample it cannot keep)
when the backlog reaches `OPCUA_SPOOL_MAX_ENTRIES` (default 1,000,000) or free
space beside the spool falls to `OPCUA_SPOOL_RESERVE_MB` (default 64). Size them
for the outage you must ride through: spool bytes ÷ pending measurements gives
bytes per sample; multiply by your sample rate and the outage window, and keep
the reserve for the operating system. Measure on the installation itself;
[capacity](CAPACITY.md) lists what has been measured so far.

PostgreSQL can refuse a single record permanently, for example a text value with a
NUL character from a fixed-length PLC string. Such data and integrity errors no longer
block the queue: the worker writes the rest of the batch and moves the refused record
to a quarantine table in the same local spool file. It is never deleted. An incident
opens; administrators can **Export quarantined** (JSON, audited) and **Retry
quarantined** after fixing the cause (audited; records keep their IDs and return as
late arrivals). Connection and server errors still keep the whole batch for retry.

Only one collector may acquire per database. It holds a PostgreSQL session advisory
lock on a dedicated connection before connecting to any machine. A second instance
waits and raises a **Second collector** incident until the lock is free. If the
lock connection drops, the collector retries; if another collector took the lock,
it disconnects its machines. A collector against a different database is not
detected; that stays procedural.

An application cannot reliably report its own complete outage or unavailable
database through that same database. Monitor `/healthz` and host disk/service status
from outside the installation. Unreceived machine events remain unknown even after
the collector recovers.

## Automated evidence

`scripts/test-production.mjs` runs browser flows and an owned loopback SMTP receiver.
`test-report-jobs.mjs` kills an actual worker during a blocked data query, recovers
the same job, checks catch-up/concurrent cursor use, fixed periods, email failure,
partial acceptance, absent SMTP and manual retry. `test-unattended-alarms.mjs`
tests UI-configured holds/hysteresis, persisted pending state, bad-quality recovery,
stale-to-fresh machine data, injected collector failures and a near-capacity backlog
against an isolated DB. `test-spool-quarantine.mjs` stores a NUL-character string
in PostgreSQL, quarantines it while later samples commit, and exports and retries it
in the browser with audit rows. `test-collector-lock.mjs` covers lock contention,
a terminated lock connection and takeover by another collector.
Physical alarms, customer SMTP and a sustained unattended deployment remain unqualified.
