# Engineering feedback

## CI latency and retained coverage

The baseline is [main run 41196897696](https://github.com/Sparkz400/performance_dashboard/actions/runs/41196897696)
at `d462e5eb9223cd5673628536cd4e478a75f1da3a`. Its browser/database job took
1,538 seconds (25 min 38 s); all four jobs together consumed 2,171 runner seconds.
[The recorded baseline](../benchmarks/ci-baseline.json) includes job durations and
all 61 original browser/database commands, arguments and environment overrides.

Four browser jobs now run on separate Ubuntu runners, each with its own PostgreSQL
service, build and seeded test installation. Commands within a job stay sequential.
[The suite manifest](../scripts/ci-suites.json) groups them by measured duration;
original script time is roughly 364–365 seconds per group, before setup and new
diagnostic coverage. This is a scheduling estimate, not a measured new completion time.
Parallel setup uses more runner time and requires available runner concurrency.

`test-ci-feedback.mjs` rejects missing/duplicate coverage and changed original
arguments or environment settings. It requires the new browser resource regression,
giving 62 commands across the four groups. Both Windows/Linux validation jobs also
run the public correctness benchmark and comparator tests. A failed suite stops its
remaining commands, explicitly recording them as `not-run`; the other groups keep
running. No regression is marked successful because it was skipped.

The existing required **Browser and database** check now aggregates the four jobs.
It runs even after a failure and passes only when every group succeeds. The build,
unit coverage, type, lint, format, container and security checks remain in place.
There is no branch-protection exception or `continue-on-error` escape.

## Finding a failure and comparing timings

Each group writes `.local/ci-feedback/shard-N/summary.json`, with source revision,
exit codes, durations and status for every command. The job summary links log names;
artifacts are `browser-evidence-1` through `browser-evidence-4`. Logs retain the last
128,000 characters; common credential fields are redacted and a truncated first
line is discarded. Treat logs as test evidence, not as safe arbitrary customer-data
exports. Existing screenshots, browser receipts and endurance cycle records remain
in the artifacts. Only owned synthetic data belongs in these jobs.

With the same fresh test database/environment as CI, reproduce a group using
`npm run ci:suite -- 1` (or 2, 3, 4). Build and install Chromium first. Never run
these destructive test fixtures against an existing installation.

After a successful CI run, download its job metadata and compare observations:

```sh
gh api repos/Sparkz400/performance_dashboard/actions/runs/RUN_ID/jobs?per_page=100 > jobs.json
node scripts/ci-feedback.mjs jobs.json
```

Use the **CI** workflow, not a security workflow, and keep the run URL and exact SHA
beside the output. Wall time runs from the first job start to the final job completion;
runner time is the sum of job durations. Queue time before the first job is excluded.
Failed or incomplete jobs are rejected. One hosted run is an observation, not a
speed guarantee; caches, host load, queueing and the additional tests affect it.

## Browser resource growth

Installation endurance records, for each page/context, Chromium JavaScript used and
allocated heap, embedder heap, backing storage, documents, DOM nodes and event
listeners. Existing application/harness resident memory, database size and disk
samples remain. The diagnostic sessions detach after sampling; attach, protocol
requests and detach each have a five-second deadline. Missing metrics fail rather
than imply zero usage.

The second completed cycle is the warm-up baseline. From the fifth completed cycle,
the minimum of the last three samples must stay within these per-page growth budgets:

| Metric | Maximum sustained increase above baseline |
| --- | ---: |
| JavaScript used heap | 128 MiB |
| Backing storage (such as ArrayBuffers) | 128 MiB |
| DOM nodes | 30,000 |
| Event listeners | 30,000 |

Exceeding any budget for all three samples fails the run and retains the measured
baseline, window minimum and limit. An isolated peak does not fail. Context/page
counts must stay at the declared user count. Even a short endurance smoke now
completes at least five full cycles, including the original outage/replay, session
renewal, report and recovery assertions, so it reaches this growth check.

These are conservative diagnostic budgets, not hardware capacity limits or a
statistical proof of a leak. Recalibrate them with retained samples and a documented
workload, not merely to make a failure disappear. Sampling never forces garbage
collection, reloads pages, replaces the browser or hides ordinary growth. Heap
values describe a Chromium isolate and may be shared across targets; do not sum
pages as total browser memory. GPU/process-wide browser memory and socket counts
are not measured here. The experimental
[Runtime heap protocol](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage)
and [DOM counters](https://chromedevtools.github.io/devtools-protocol/tot/Memory/#method-getDOMCounters)
are checked against the installed Chromium by `test-browser-resources.mjs` on both
Linux and Windows. That test retains actual buffer/DOM/listener allocations and
also exercises missing metrics, a stalled request, sustained growth and transient peaks.

Run `node scripts/test-browser-resources.mjs` for the small owned-browser fixture.
For full-stack workload controls and the separate 72-hour acceptance gate, see
[factory readiness](FACTORY_READINESS.md). An already running qualification uses its
immutable source revision; this instrumentation does not retroactively change or
qualify that run. Physical equipment and publisher signing remain separate gates.
