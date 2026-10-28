# Factory readiness: operation, supervision and comparisons

This wave extends the existing daily workflows. It does not qualify a physical
machine, a production installation or a universal capacity limit. All automated
acceptance uses owned simulators and isolated databases.

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
node scripts/test-installation-endurance.mjs --hours 0.04 --cycle-seconds 20 --outage-seconds 3 --restart-every 1 --users 3 --tags 20
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
