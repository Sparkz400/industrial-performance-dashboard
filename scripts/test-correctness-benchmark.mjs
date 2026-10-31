import assert from "node:assert/strict";
import {
  loadCorrectnessSuite,
  compareCorrectness,
} from "./run-correctness-benchmark.mjs";
import { dashboardResult } from "./correctness-adapter.mjs";

const suite = await loadCorrectnessSuite();
const actual = {
  format: "pd-correctness-result-v1",
  suite: suite.inputs.suite,
  datasetSha256: suite.datasetSha256,
  results: suite.inputs.cases.map(({ id, input }) => ({
    id,
    result: dashboardResult(input),
  })),
};
assert.deepEqual(compareCorrectness(suite, actual), {
  passed: true,
  cases: 15,
  failures: [],
});
const changed = structuredClone(actual);
changed.results.find(
  (row) => row.id === "missing-counter-reading",
).result.oee.overall = 0;
assert.equal(
  compareCorrectness(suite, changed).passed,
  false,
  "Unknown must not compare equal to zero",
);
changed.results[0].result.quantities.total++;
assert(
  compareCorrectness(suite, changed).failures.some((failure) =>
    failure.path.endsWith("quantities.total"),
  ),
);
assert.throws(
  () =>
    compareCorrectness(suite, { ...actual, results: actual.results.slice(1) }),
  /Missing/,
);
assert.throws(
  () =>
    compareCorrectness(suite, {
      ...actual,
      results: actual.results.map(() => actual.results[0]),
    }),
  /Duplicate/,
);
assert.throws(
  () => compareCorrectness(suite, { ...actual, datasetSha256: "different" }),
  /different inputs/,
);
const extra = structuredClone(actual);
extra.results[0].result.ignoredMistake = true;
assert.equal(
  compareCorrectness(suite, extra).passed,
  false,
  "Unexpected output fields must fail",
);
console.log(
  "PASS: 15 independent answers; altered totals, unknown-to-zero, missing/duplicate cases and dataset mismatches are rejected",
);
