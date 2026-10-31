# Factory readiness: operation, supervision and comparisons

This wave extends the existing daily workflows. It does not qualify a physical
machine, a production installation or a universal capacity limit. All automated
acceptance uses owned simulators and isolated databases.

[PR #63](https://github.com/Sparkz400/performance_dashboard/pull/63) tracks the
implementation and hosted checks. The sustained workload is a separate acceptance
gate; use its completed receipt rather than the PR's short CI smoke duration.

## Supervisor workflows

Daily operations exposes production-line investigations and alarm maintenance
actions to administrators and supervisors. A supervisor must have access to every
machine in a line; granting access to only part of a line does not expose its
other machines. Maintenance actions remain scoped to the selected machine.

Assignments and corrections retain the actor, reason and previous values. Changes
must use the current action version so one person's stale form cannot overwrite
another person's work. Corrections have no fixed count ceiling. Previous values,
actor, timestamp and reason are stored atomically in a separate history table;
machine-scoped history is browsed 20 entries at a time. Migration 0040 copies every
existing JSON history entry before removing the old column, in the migration
transaction. Use a complete pre-upgrade backup for rollback to older software.
An unchanged overdue deadline can be
retained during correction; a replacement deadline must be in the future.
API timestamps require an explicit UTC offset.

`GET /api/v1/maintenance-actions/:id/revisions?after=0` returns `revisions` and a
`next` version cursor (null at the end). Follow that cursor to read the complete
history; action list and mutation responses no longer embed it. The same
administrator/supervisor and machine-access checks apply to every page.

Shift reports merge ordered observations and manual-state boundary events in one
sweep after sorting. Repeated or overlapping declarations remain active until their
last end boundary; measured states still win and conflicting declarations leave
unknown time. Seeded reference comparisons and a 10,000-boundary regression protect
these rules without imposing a machine-dependent timing threshold.

Completion requires a newer completed service inspection on the same machine.
Measured recovery is tracked separately: recording work can leave the action
awaiting recovery, and a later alarm episode is shown as recurrence. Operators
retain the existing inspection workflow; action management requires a supervisor
or administrator.

The line, action and comparison screens support English and German. Automated
browser checks cover narrow screens and keyboard interaction; real operator,
glove and viewing-distance acceptance remain separate.

## Fair comparisons

Compare two saved report revisions from different, chronological, non-overlapping
shifts on the same machine. The selected reports remain frozen, including their
definitions, measurements and corrections. A newer revision is identified rather
than silently substituted. The original report revision and its digest remain
available for inspection.

Differences are shown only when the evidence is comparable: finished windows,
complete coverage, consistent measurement definitions, equal scheduled duration
and equivalent product mix. Otherwise the screen retains the individual values
and explains why it withholds the difference. Missing quantities remain unknown.
Energy comparison additionally requires complete frozen energy evidence and the
same meter definition.

Completed maintenance between the two periods provides attributable context. It
is read separately from the frozen reports and is not evidence that maintenance
caused a performance change. This first version compares shifts on one machine;
it does not rank machines or automatically normalize dissimilar product mixes.

## Endurance acceptance

The storage/replay workload in `scripts/test-endurance.mjs` remains useful for
targeted regressions. Installation endurance must also exercise the actual OPC UA
collector, application, alarm evaluation, scheduled reports and signed-in browser
sessions through deliberate interruptions.

Run the short smoke after building both applications:

```sh
node scripts/test-installation-endurance.mjs --hours 0.04 --cycle-seconds 20 --outage-seconds 3 --restart-every 2 --users 3 --tags 20
```

Run the sustained workload from a committed checkout whose source and builds will
remain unchanged for the run:

```sh
node scripts/test-installation-endurance.mjs --hours 72 --users 3 --tags 20 --cycle-seconds 300 --outage-seconds 10 --restart-every 288
```

It creates a privately bound, labeled PostgreSQL container and owned OPC UA/SMTP
endpoints. Incremental `status.json` and `cycles.jsonl` receipts live under the
printed `.local/pd-installation-*` directory. Pending spool records are checked
against canonical history after recovery, including identity, values, quality and
clocks. Browser sessions inspect collected history; scheduled PDFs and alarm
transitions must continue. Store failures disconnect live streams until permission
checks succeed again, without treating temporary storage failures as logout.
Revoked or expired sessions remain rejected.

`chromium-netlog.json` retains recent socket-level events with a 64 MB rolling
limit and Chromium's default capture mode, which excludes cookie credentials and
payload bytes. After the browser closes, the harness also redacts custom CSRF
headers from the flushed JSON. Preserve it and any in-progress log fragments
privately with failed receipts: unfinished fragments can contain custom headers,
and request URLs and local endpoint details remain diagnostic data. Receipts record the
Chromium version and timestamp/context for browser failures.

Process restarts occur after the first cycle and every 288 cycles thereafter.
Database interruptions occur every cycle. Process-age and memory receipts therefore
describe roughly day-long application lifetimes within the 72-hour workload,
not one uninterrupted 72-hour process. The simulator explicitly closes abandoned
sessions after forced client termination; vendor session-timeout behavior is not
qualified. The compiled frontend is copied into the run's isolated public directory
and served by the application, including across restarts. Its entry digest is in the
receipt. This is not production-image or reverse-proxy qualification. SMTP is a local fixture.
Suspension or clock discontinuities over 30 seconds during collection fail the
run; time while the host sleeps cannot be counted as sustained operation.

A short run verifies the harness and recovery paths. Only a completed run's
recorded elapsed time establishes its duration. A running process or successful
short smoke test does not establish 72-hour reliability. Receipts must identify
the tested source revision, workload, failures and excluded qualification gates.

Keep the checkout and its owned resources while a long run is active. Preserve
the final evidence outside an unused worktree before cleanup. A machine-owner
approved physical pilot, independent full-shift reconciliation and deployment
acceptance are still required separately.

## Software validation — 2026-10-28

- Full unit/coverage suites: **185 server tests and 80 client tests** passed.
  Coverage gates pass, but coverage of the wider legacy application is incomplete.
- Both application builds, client type checking and migration generation pass;
  the additive `0016_maintenance_action_revisions` migration preserves existing rows.
- Isolated API/browser fixtures cover scoped supervisor access, stale corrections,
  inactive-site assignments, recovery/recurrence, frozen comparison integrity,
  counter resets, unknown values, product mismatch and revoked permissions.
- Actual English/German browser workflows at 768 and 390 pixels, keyboard controls
  and screenshots were checked. The existing 15-browser-test regression also passes.
- Measurement, historical export, process recovery, access, daily workflow and
  production fixtures pass against isolated databases and owned OPC UA/Modbus servers.
- Full-application smoke workloads exercise three signed-in browsers and 20 tags.
  Four forced-restart cycles recovered 314 checkpoint events exactly once; a
  separate three-cycle run recovered 223 checkpoint events, including two database
  interruptions without application restart. These were minute-long runs, not 72 hours.
- The application image passes runtime and container smoke checks. Installation,
  restore, recovery-mode access, failed-upgrade rollback and an independent synthetic
  capacity fixture have separate receipts. These do not establish physical acceptance.

Reproduction: `scripts/test-supervisor-workflows.mjs`,
`scripts/test-period-comparisons.mjs`, `scripts/test-installation-endurance.mjs`,
the existing `scripts/test-production.mjs` and the normal repository checks.
CI runs the new workflows and a short full-application workload. Only selected
receipts/screenshots are uploaded; private simulator keys and spools are excluded.

The 72-hour acceptance gate remains open until its completed receipt is reviewed.

### First sustained run and transport follow-up

The first run on `f3a1483a` stopped on 2026-10-28 at 08:00 UTC after roughly
25 minutes, with a connection reset from Playwright's separate Node HTTP client
during a trend GET. Four completed cycles had preserved their accepted samples;
the application log did not record an application failure at the reset time.
The saved evidence cannot establish exactly which socket closed or why. This is
a failed run, and none of its elapsed time counts toward replacement acceptance.

Historian and metrics reads now use authenticated `fetch` inside the actual
Chromium page, matching the browser workload being measured. The harness adds no
retries. Transport regression checks prove normal idle-connection closure works
while HTTP authorization/server errors, truncated responses and timeouts still
fail. Unexpected application exits are recorded and fail the run immediately.
Failure receipts and console diagnostics redact credential headers; the original
failed run's session-cookie call log is kept private and redacted in exported
evidence. Run `node scripts/test-endurance-harness.mjs` before the full smoke.

Windows status readers can briefly prevent an atomic file replacement. Receipt
writes retry only those sharing violations for up to two seconds; a persistent
lock still fails and retains both the previous receipt and the flushed temporary
file. A real Windows file-lock regression covers both outcomes. This does not
retry or accept failed application requests. An intervening smoke also failed
during a Docker Desktop engine outage; its evidence and later owned-container
cleanup receipt are retained separately, and its elapsed time is not acceptance.

A new clean-revision run must complete its own full 72-hour workload. Browser
transport acceptance still does not qualify physical equipment or deployment.

The clean replacement on `b9bc8338` also failed, after about 43 seconds of
workload: one browser did not show the operations heading within the existing
five-second visibility check. The application stayed alive and cleanup completed.
That attempt lacked a failure-page capture, so its precise cause remains
unresolved. Subsequent failures now retain bounded page text, screenshots, URLs,
failed requests and outstanding-request ages. The visibility threshold and
application assertions are unchanged; neither failed attempt contributes any
passing duration.

### Database interruption follow-up

Hosted endurance on `2ff19821` recorded an unexpected application exit during a
database interruption. Its uploaded evidence did not contain the application
stack, so the exact cause of that specific exit is not established. Failure
receipts now include the bounded, credential-redacted application tail.

A separate forced-disconnect regression reproduced a process crash when a pooled
PostgreSQL client was checked out: the pool only handled errors from idle clients.
Each connection now retains a client error listener while checked out. Failed
queries still reject and transaction owners still release their own connections.
`node scripts/test-database-client-errors.mjs` proves idle and active interrupted
transactions roll back, the process survives, and a fresh pooled query succeeds.
It uses a fresh owned database and terminates only that database's test sessions.

The pre-fix crash and post-fix passing regression are preserved separately.
Both builds, type checks, 265 unit tests and the harness regressions pass; lint
has no errors and 13 existing warnings. Two local replacement smoke attempts
stopped during startup because Docker Desktop's engine was unavailable, before
the application workload began. Further full-application smoke, exact-head CI and
a new complete 72-hour run are required; the earlier heading failure remains
unresolved and physical-machine qualification remains open.

### Compiled frontend follow-up — 2026-10-30

The latest main/PR #81 failures captured one blank operations page with an aborted
development-module request while other sessions continued. Endurance now copies the
compiled frontend into its isolated public directory and uses the application's own
static server, keeping the existing visibility, freshness and recovery assertions.
This also exposed and fixed SPA routes returning 404 beneath hidden installation
directories: the index is now resolved relative to the explicit public root.

The compiled-frontend smoke completed four recovery cycles over 0.0437 workload hours,
with zero missing provenance and every checkpoint event replayed exactly once. This
short evidence is not a 72-hour pass. A replacement run must start from the final
committed revision; historical failed duration must not be carried forward.

A subsequent clean-revision smoke failed after two cycles inside node-opcua-server's
notification queue: its overflow handler asserted that every value had Good quality.
An isolated regression reproduces this for Uncertain and Bad values. The guarded
installation patch removes those two invalid assertions while retaining the original
quality, metadata, overflow bits and diagnostic counters. Both queue discard policies
are checked locally and in the packaged runtime. Dependency source changes require
explicit patch review; see [dependency maintenance](DEPENDENCY_REVIEW.md#opc-ua-overflow-patch).
The failed attempt contributes no accepted endurance duration.

### Hourly session renewal follow-up — 2026-10-30

The clean run on `1a5abff7` stopped after 11 successful recovery cycles (0.9622
completed workload hours). At the hourly login refresh, all three browsers correctly
redirected their still-authenticated `/login` visits to the dashboard. The harness
then timed out waiting for the absent Username field; there were no page errors.

Renewal now uses the visible Sign Out control, requires a successful server logout,
then signs in through the normal form. Every run exercises this same renewal path
once during startup, so the short CI smoke covers it without waiting an hour.
Cycle receipts include `sessionRenewals`. Authentication and expiry rules are
unchanged. The failed run is retained separately and contributes no passing duration
to its fresh 72-hour replacement.

### Browser transport investigation — 2026-10-31

The clean `3385acb0` run failed after 179 cycles and 15.6647 completed workload
hours. Its replacement on `9e75ca68` failed at 09:28 UTC after 11 cycles and
0.9640 completed workload hours. Both captured `ERR_NO_BUFFER_SPACE` for a
compiled script and a Daily operations visibility timeout. The harness stopped
the application during failure cleanup; an unexpected application exit was not
observed. All completed recovery checkpoints retained exactly-once replay.

The replacement's minute-by-minute process, socket and host-memory samples do
not establish exhaustion: its final sample still had roughly 33 GiB of free
physical memory and modest owned socket counts. The precise transport cause
remains unresolved. Failed receipts, logs, screenshots, spool and immutable
sources are preserved privately. No failed duration is reused.

An isolated diagnostic on `cd739ca5` accelerated renewal to every 30 seconds. It
passed seven recovery cycles and 21 renewals over 0.095025 workload hours, with
no `ERR_NO_BUFFER_SPACE` event in its NetLog. Its modified harness is explicitly
ineligible for qualification; this did not reproduce or explain the long-run
failure and does not establish that it is fixed.

Bounded Chromium NetLog capture now supplements those samples, without retries,
browser replacement or relaxed visibility/freshness checks. A real-browser
regression verifies that socket events survive shutdown and the fixture's
session credential is excluded. These diagnostics are not a claimed fix or
72-hour acceptance. A fresh clean-revision run must pass all existing gates.

### Stable network during database outages — 2026-10-31

Main run [41190892557](https://github.com/Sparkz400/performance_dashboard/actions/runs/41190892557)
completed two recovery cycles, then Chromium aborted frontend assets with
`ERR_NETWORK_CHANGED` and all three pages stayed blank. The preceding PR run on
identical source passed. Restarting the database container also recreated its
virtual network interface; this is an avoidable disturbance of the browser host.

The harness now holds the owned container/network namespace alive and restarts
PostgreSQL itself with `pg_ctl -m fast -w stop` and the image's normal entrypoint.
Every cycle proves SQL is unavailable, a new PostgreSQL start time is observed,
and the network identity stays constant. Application restarts, durable-spool
checkpoints, exact-once replay, browser queries and failure assertions are retained.
There is no browser retry or suppressed network failure. Container/host-network
restart qualification remains separate from this database-process outage test.

The Windows 72-hour attempt at `9e75ca68` also failed, after 11 cycles and
0.9640052777777778 actual workload hours. Its earlier asset/resource failure is
not proven to have this cause. Existing receipts remain preserved; neither this
harness correction nor a short CI pass closes the 72-hour gate.

Local Windows smoke passed four recovery cycles over 0.05256277777777778 workload
hours: each database restart retained its network identity, all 291 checkpointed
measurements replayed exactly once, and the three browser sessions completed
queries, reports, alarm acknowledgement and login renewal. This is short recovery
evidence, not endurance acceptance.
