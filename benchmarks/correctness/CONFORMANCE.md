# OEE conformance suite

**OEE you can audit.** The suite publishes machine-data inputs, independently
reasoned answers and a strict comparator. Any OEE implementation can run the same
inputs, publish its result file and let anyone check the claim, including where the
correct answer is *unknown*.

Conformance means one thing: for a named suite version, an implementation's results
match every published answer within the published tolerance. It is not a
certification, not an ISO certification and not a physical-machine qualification.
Performance Dashboard maintains the suite; passing it grants no endorsement.

## Suites and versions

| Suite | Directory | Cases | Dataset SHA-256 (canonical `cases.json`) | Answers SHA-256 (canonical `expected.json`) | Status |
| --- | --- | --- | --- | --- | --- |
| `shift-v1` | [v1](v1/) | 15 | `d4df800292cde4b3a4a03cdc1f1ebd5c7d415e7e5d9afee3fa8dd18b4ef6ae99` | `8c3e0b788b5d9f6ad6bf06d15dd6cb864a2faac7f38f0d335a8cc582d331ce53` | current |

The canonical form and the result envelope are described in the
[benchmark README](README.md#compare-another-implementation).

Stability rules:

- A published suite version is immutable. Its inputs, answers, tolerance, result
  fields and envelope formats never change. `test-correctness-benchmark.mjs` fails
  if either hash above changes.
- Any change to cases, inputs, answers, tolerance or result fields, including an
  erratum, is published as a new suite version (`shift-v2` in `v2/`). Earlier
  versions stay in the repository and remain runnable.
- The comparator version (`COMPARATOR_VERSION` in
  [run-correctness-benchmark.mjs](../../scripts/run-correctness-benchmark.mjs))
  increases whenever what passes or fails changes. Changes to the report layout do
  not change it. Version `1` is the strict comparison described in the README.

## Run it against another implementation

1. Check out this repository at a tagged release or a named commit and use Node.js 24.
   The comparator needs no database, build, network or installed dashboard.
2. Feed each `cases[].input` from `v1/cases.json` to your implementation, translating
   the input format as needed. Do not read `expected.json`, copy its values or
   special-case case identifiers.
3. Write the `pd-correctness-result-v1` envelope with every case, and set
   `implementation` to the product name, version and source revision or build id.
4. Compare and produce the claim table:

```sh
node scripts/run-correctness-benchmark.mjs --results your-results.json --out comparison.json --report claim.md
```

The exit code is zero only when all cases match. `comparison.json` contains your
results, the comparator version and every difference. `claim.md` is a Markdown table
with one row per case and the differing fields, ready to paste into a claim.

## What a claim states

A claim is valid only with all of these:

- suite id and dataset SHA-256 (both are checked by the comparator);
- implementation name, version and source revision or build id;
- comparator version and the commit of this repository used to compare;
- date of the run;
- the complete result envelope (`comparison.json` contains it);
- the adapter code or configuration used to translate inputs, so the result can be
  regenerated, and whether anything was changed after looking at the answers.

Only 15 of 15 matching cases is a pass. Use this wording:

> *Implementation* *version* (*revision*) conforms to the Performance Dashboard OEE
> conformance suite `shift-v1` (dataset `d4df8002…`, comparator 1) as of *date*.

A partial result is published as a failure with its differing cases listed, never
as "partially conformant".

## Reproduction and the claims register

Submit claims with the **Conformance report** issue form. A maintainer reruns the
comparator on the attached envelope and records the claim below as
**self-reported**. It becomes **reproduced** when someone other than the claimant
regenerates the envelope from the stated revision and adapter and gets the same
comparison. The comparator never executes submitted code, and maintainers do not
run unknown binaries on project infrastructure. A claim stays valid for the suite
version it names; a later suite version needs a new claim.

| Implementation | Revision | Suite | Comparator | Result | Status |
| --- | --- | --- | --- | --- | --- |
| Performance Dashboard | every push to `main` ([CI workflow](../../.github/workflows/ci.yml)) | `shift-v1` | 1 | 15/15 | self-reported |

## Disagreements and errata

If you think an answer is wrong, open an issue with the case id, the field, your
value and your arithmetic, referring to the published `reasoning`. Outcomes:

- **The answer stands.** The reasoning or this specification is clarified; no data changes.
- **The answer is wrong.** The erratum is recorded below and a corrected suite is
  published as a new version. The earlier version is marked superseded and stays
  runnable; claims against it keep their meaning.

A deliberate difference in interpretation, such as clamping effectiveness at 100% or
counting unknown time as downtime, is not an erratum. The suite encodes the choices
listed below; state your deviation in your claim instead.

No errata have been recorded.

## ISO 22400-2 mapping

The suite's result fields relate to the time, quantity and KPI elements of
ISO 22400-2 as follows. Names and abbreviations refer to ISO 22400-2:2014; check
them against your licensed copy. The mapping is informative; this suite does not
reproduce or replace the standard.

| Suite field | ISO 22400-2 element or KPI | Relationship in this suite |
| --- | --- | --- |
| input `end` − `start` | Planned operation time (POT) | Shift interval in elapsed seconds |
| `plannedSeconds` | Planned down time (PDOT) | Breaks, the planned machine state and planned-category stop reasons on known non-running time |
| `scheduledSeconds` | Planned busy time (PBT) | POT − PDOT |
| `seconds.running` | Actual production time (APT) | Running state time; running inside an excluded break is not APT |
| `seconds.idle`, `seconds.fault` | Actual unit delay time (ADET), actual unit down time (ADOT) | Non-running states as mapped by the profile; delay, down and setup time (AUST) are not separated |
| `seconds.planned` | Part of PDOT | Planned state reported by the source |
| `seconds.unknown`, `observedSeconds` | none | Time without trustworthy state evidence, and POT minus that time |
| input `profile.idealCycleMs` | Planned run time per item (PRI) | Ideal cycle standard |
| `quantities.total` | Produced quantity (PQ) | Counter increments observed within the shift |
| `quantities.good` | Good quantity (GQ) | Good counter increments |
| `quantities.reject` | PQ − GQ | Scrap (SQ) and rework (RQ) are not distinguished |
| `oee.availability` | Availability = APT / PBT | |
| `oee.performance` | Effectiveness = PRI × PQ / APT | |
| `oee.quality` | Quality ratio = GQ / PQ | |
| `oee.overall` | OEE index = Availability × Effectiveness × Quality ratio | |
| `deliveredEvents`, `uniqueEvents`, `quantitySource`, `stateSource`, `manualStateSeconds`, `verified` | none | Evidence and provenance fields |

## Where the suite goes beyond the standard

ISO 22400-2 defines the KPIs over complete time and quantity accounting. The suite
also fixes how incomplete or conflicting machine data is interpreted:

- **Unknown stays unknown.** Any unknown state time makes Availability and the OEE
  index `null`; incomplete counter coverage makes Effectiveness, Quality ratio and
  OEE `null`. `null` is never 0 or 1. Effectiveness can still be reported from
  complete counters over observed running time (`stale-state`, `bad-quality`,
  `missing-counter-reading`, `unsampled-start-boundary`).
- **Source quality matters.** Only samples with a Good source StatusCode provide
  evidence; others are unknown (`bad-quality`).
- **No clamping.** Effectiveness above 1 is reported as observed and marks the result
  unverified (`stale-state`), instead of being capped at 100%.
- **Counter policies are explicit.** A counter decrease is discarded unless the
  profile approves reset-to-zero, and a rollover needs a declared modulus
  (`unapproved-reset`, `approved-reset`, `rollover`).
- **Elapsed time, not wall-clock hours.** Daylight-saving shifts last 7 or 9 hours
  (`dst-spring`, `dst-autumn`); a reading before the shift cannot allocate production
  into it (`unsampled-start-boundary`).
- **Duplicates count once.** Redelivered events with the same identity, in any order,
  do not change the answer (`duplicate-pending-delivery`).
- **Measured evidence takes precedence.** Measured states and quantities win over
  manual declarations; overlapping manual states are unknown; any manual contribution
  keeps the result unverified (`conflicting-manual-states`,
  `manual-versus-measured-state`, `manual-versus-measured-quantity`).
- **Running during planned down time** withholds Effectiveness and OEE rather than
  assigning that production to PBT (`running-during-break`).
- **`verified`** is the suite's reconciliation flag. It is not an ISO KPI and not a
  certification.

## Invitation to other OEE tools

Ready to post; no project has been contacted on its behalf.

> **Can your OEE calculation be audited?** The Performance Dashboard OEE conformance
> suite `shift-v1` publishes 15 synthetic shift inputs (counter resets and rollovers,
> stale and bad-quality data, duplicates, daylight-saving shifts, manual versus
> measured evidence) with independently reasoned answers mapped to ISO 22400-2 KPIs.
> Run the inputs through your tool, compare with one Node.js command and publish the
> result, including the cases you interpret differently. No database or installation
> is needed. Apache-2.0:
> https://github.com/Sparkz400/performance_dashboard/blob/main/benchmarks/correctness/CONFORMANCE.md
