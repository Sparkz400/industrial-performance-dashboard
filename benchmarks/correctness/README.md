# Public correctness benchmark

Version 1 publishes 15 synthetic shift calculations, their inputs, and independently
specified answers. It is Apache-2.0 licensed with the repository. No customer or
physical-machine data is included. The goal is a reproducible comparison of data
interpretation, not a speed score or a claim of universal OEE semantics.

Other tools can run it as an open conformance suite: the
[conformance specification](CONFORMANCE.md) defines versioning, what a claim states,
the claims register, errata and the mapping to ISO 22400-2 KPIs.

## Run Performance Dashboard

Use Node.js 24 from the repository root:

```sh
npm ci
npm run build:server
npm run benchmark:correctness -- --out .local/correctness-benchmark/result.json
node scripts/test-correctness-benchmark.mjs
```

No database server, credentials, browser or network is needed after installation.
The adapter uses the actual profile validator, pending measurement spool, quality
normalization and shift calculator. It receives only inputs, never expected answers.
The last command checks the comparator also rejects incorrect and incomplete results.
Windows and Linux CI run both commands after the build.

## Published cases

[cases.json](v1/cases.json) contains all inputs. [expected.json](v1/expected.json)
contains every answer and its arithmetic reasoning, specified separately from the
calculator. Fractions are stored as JSON numbers and compared within `1e-9` absolute
tolerance. Counts below are observed increments, not invented missing production.

| Case | Expected interpretation |
| --- | --- |
| `known-shift` | 30 s running, 30 s fault; 15 total, 13 good, 2 rejects; OEE 13/30 |
| `unapproved-reset` | Discard decreases; observed 14/11/3; incomplete counters withhold performance, quality and OEE |
| `approved-reset` | Explicit reset-to-zero policy counts 16/12/4; OEE 0.4 |
| `rollover` | Explicit modulus 100 counts 15/13/2 across rollover |
| `missing-counter-reading` | Only 7 total increments observed; gap withholds performance, quality and OEE |
| `stale-state` | 20 s running, 40 s unknown; availability/OEE unknown; observed-runtime performance 1.5 remains visible |
| `bad-quality` | 15 s running, 30 s fault, 15 s unknown; no complete counter coverage |
| `duplicate-pending-delivery` | 40 deliveries with 20 unique identities; reverse order and duplicate delivery leave the answer unchanged |
| `dst-spring` | Berlin 00:00–08:00 spans 7 elapsed hours; 84 good parts at 300 s each |
| `dst-autumn` | Berlin 00:00–08:00 spans 9 elapsed hours; 108 good parts at 300 s each |
| `conflicting-manual-states` | Overlap is unknown: 15 s running, 15 s fault, 30 s unknown; never verified |
| `manual-versus-measured-state` | Retain measured fault time despite a conflicting manual running declaration; never verified |
| `manual-versus-measured-quantity` | Retain measured 15/13/2 despite reviewed 99/98/1; never verified |
| `running-during-break` | 15 s planned break reduces scheduled time to 45 s; running during the break withholds performance/OEE |
| `unsampled-start-boundary` | A pre-shift reading cannot allocate production across the start boundary; observed 8/7/1, incomplete coverage |

Profiles specify ideal cycle time, state mapping, maximum sample gap, reset and
rollover policies. Dates contain explicit UTC offsets; `timezone` records the
calendar context. State intervals are half-open; counter deltas require both
readings within the shift. `asOf` is fixed, so wall-clock time cannot change results.
`quality` is a source StatusCode string; non-Good values cannot supply good evidence.
`null` means unknown and must never be converted to zero or perfect quality.
Performance above one is preserved as an observed factor, not silently clamped.

## Compare another implementation

Read each `cases[].input` and emit this JSON envelope (one result for every ID):

```json
{
  "format": "pd-correctness-result-v1",
  "suite": "shift-v1",
  "datasetSha256": "SHA-256 of canonical cases.json",
  "implementation": "your implementation and revision",
  "results": [{ "id": "known-shift", "result": {} }]
}
```

The illustration omits results for brevity; `{}` and partial submissions fail.
Each `result` must have exactly the fields shown in `expected.json`: delivered and
unique event counts, state seconds, planned/scheduled/observed seconds, quantities,
quantity/state source, manual state seconds, four OEE factors, and `verified`.
Factors are ratios, not percentages. Booleans, strings and nulls compare exactly;
numeric fields use the published tolerance. Case order is irrelevant, but duplicates,
missing/extra cases, extra metric fields and an incorrect input hash fail.

Canonical input JSON sorts object keys recursively, preserves array order, uses
compact JSON with UTF-8 and no trailing newline. The exact implementation is
[canonicalJson.ts](../../server/src/utils/canonicalJson.ts). Obtain the hash without
building or installing the dashboard:

```sh
node --input-type=module -e "import {loadCorrectnessSuite} from './scripts/run-correctness-benchmark.mjs'; console.log((await loadCorrectnessSuite()).datasetSha256)"
node scripts/run-correctness-benchmark.mjs --results other-results.json --out comparison.json --report claim.md
```

The comparator is standalone Node.js 24 code in this checkout. It reads JSON up to
1 MiB; it does not execute another implementation. Exit code zero means all cases
match; differences include the case/field path and expected/actual values. An output
report includes the submitted results, the comparator version and the comparison.
`--report` writes a Markdown claim table with one row per case and its differing
fields; it requires the `implementation` field. There is no automatic golden-answer
update command. Version 1 is immutable and its test pins both hashes; semantic
changes and fixture corrections are published as a new suite version with reviewed
reasoning ([errata](CONFORMANCE.md#disagreements-and-errata)).

## Limits

The duplicate case exercises identities still pending in an in-memory spool. It
does not establish crash durability or deduplication after PostgreSQL acknowledgement;
the existing recovery, edge and installation-endurance tests cover those paths.
These 15 cases do not cover every product mix, calendar, input type or report flow.
`verified` is the calculator's internal reconciliation flag, not independent
certification. Passing does not qualify physical equipment or multi-day reliability.
