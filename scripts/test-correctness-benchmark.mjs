import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../server/src/utils/canonicalJson.ts";
import {
  loadCorrectnessSuite,
  compareCorrectness,
  claimReport,
} from "./run-correctness-benchmark.mjs";
import { dashboardResult } from "./correctness-adapter.mjs";

const suite = await loadCorrectnessSuite();
// shift-v1 is immutable (CONFORMANCE.md): changed inputs or answers need a new suite version.
assert.equal(
  suite.datasetSha256,
  "d4df800292cde4b3a4a03cdc1f1ebd5c7d415e7e5d9afee3fa8dd18b4ef6ae99",
);
assert.equal(
  createHash("sha256").update(canonicalJson(suite.expected)).digest("hex"),
  "8c3e0b788b5d9f6ad6bf06d15dd6cb864a2faac7f38f0d335a8cc582d331ce53",
);
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

const claimed = { ...changed, implementation: "Example | tool\n`v2` <b>" };
const claim = claimReport(
  suite,
  claimed,
  compareCorrectness(suite, claimed),
  "2026-10-31",
);
assert.match(claim, /Result: FAIL — 13\/15 cases/);
assert.match(claim, /\| known-shift \| FAIL \| 21 \| `quantities\.total` \|/);
assert.match(
  claim,
  /\| missing-counter-reading \| FAIL \| 21 \| `oee\.overall` \|/,
);
assert.match(claim, /\| dst-spring \| PASS \| 21 \| none \|/);
assert.match(claim, /Implementation: Example \\\| tool \\`v2\\` \\<b\\>$/m);
assert.equal(claim.split("\n").filter((l) => /^\| [a-z]/.test(l)).length, 15);
assert.match(
  claimReport(
    suite,
    { ...extra, implementation: "x" },
    compareCorrectness(suite, extra),
    "x",
  ),
  /\| known-shift \| FAIL \| 21 \| `\(field set\)` \|/,
);
assert.throws(
  () => claimReport(suite, actual, compareCorrectness(suite, actual), "x"),
  /implementation/,
);
// The published --results CLI: real child processes, owned temporary files, no shell.
const cli = fileURLToPath(
  new URL("./run-correctness-benchmark.mjs", import.meta.url),
);
const run = (...args) => {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
};
const temp = await mkdtemp(join(tmpdir(), "pd-correctness-cli-"));
try {
  const file = (name, body) => {
    const path = join(temp, name);
    return writeFile(path, body).then(() => path);
  };
  const valid = run(
    "--results",
    await file("valid.json", JSON.stringify(actual)),
  );
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).passed, true);

  const out = join(temp, "out", "mismatch.json");
  const mismatch = run(
    "--results",
    await file("mismatch.json", JSON.stringify(changed)),
    "--out",
    out,
  );
  assert.equal(mismatch.status, 1);
  assert.equal(JSON.parse(mismatch.stdout).passed, false);
  const recorded = JSON.parse(await readFile(out, "utf8"));
  assert.equal(recorded.comparison.passed, false);
  assert(
    recorded.comparison.failures.some(
      (f) => f.path === "missing-counter-reading.oee.overall",
    ),
  );

  const bounded = (result, pattern) => {
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, pattern);
    assert(
      result.stderr.length < 500,
      `diagnostic is bounded: ${result.stderr.length}`,
    );
  };
  bounded(
    run("--results", await file("malformed.json", '{"format": ')),
    /JSON/,
  );
  bounded(run("--results", join(temp, "absent.json")), /ENOENT|no such file/);
  bounded(
    run(
      "--results",
      await file("large.json", `{"padding":"${"x".repeat(1024 * 1024)}"}`),
    ),
    /exceed 1 MiB/,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log(
  "PASS: 15 independent answers; altered totals, unknown-to-zero, missing/duplicate cases and dataset mismatches are rejected; claim reports list differing fields; the --results CLI exits 0/1 with bounded diagnostics",
);
