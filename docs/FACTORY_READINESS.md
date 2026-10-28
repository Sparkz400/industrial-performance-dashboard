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
another person's work. Each action retains at most 100 corrections; further edits
are rejected without discarding history. An unchanged overdue deadline can be
retained during correction; a replacement deadline must be in the future.
API timestamps require an explicit UTC offset.

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

Process restarts occur after the first cycle and every 288 cycles thereafter.
Database interruptions occur every cycle. Process-age and memory receipts therefore
describe roughly day-long application lifetimes within the 72-hour workload,
not one uninterrupted 72-hour process. The simulator explicitly closes abandoned
sessions after forced client termination; vendor session-timeout behavior is not
qualified. The frontend runs through Vite, so this is not production-image or
reverse-proxy qualification. SMTP is a local fixture.
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
