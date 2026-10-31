import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { runCiSuite } from "./run-ci-suite.mjs";
import {
  loadCiSuites,
  validateCiSuites,
  summarizeCiJobs,
} from "./ci-feedback.mjs";
import { safeFailure } from "./endurance-harness.mjs";

const { manifest, baseline } = await loadCiSuites();
assert.equal(validateCiSuites(manifest, baseline), 62);
const removed = structuredClone(manifest);
removed.shards["1"].pop();
assert.throws(
  () => validateCiSuites(removed, baseline),
  /Required CI coverage/,
);
const duplicate = structuredClone(manifest);
duplicate.shards["2"].push(duplicate.shards["1"][0]);
assert.throws(() => validateCiSuites(duplicate, baseline), /Duplicate/);
const disabled = structuredClone(manifest);
const daily = Object.values(disabled.shards)
  .flat()
  .find((test) => test.script === "scripts/test-daily-workflows.mjs");
daily.env = {};
assert.throws(() => validateCiSuites(disabled, baseline));
const jobs = {
  jobs: [
    {
      name: "A",
      conclusion: "success",
      started_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:02:00Z",
    },
    {
      name: "B",
      conclusion: "success",
      started_at: "2026-01-01T00:00:30Z",
      completed_at: "2026-01-01T00:03:00Z",
    },
  ],
};
assert.equal(summarizeCiJobs(jobs).wallSeconds, 180);
assert.equal(summarizeCiJobs(jobs).runnerSeconds, 270);
assert.throws(
  () => summarizeCiJobs({ ...jobs, total_count: 3 }),
  /Incomplete job metadata/,
);
assert.throws(
  () => summarizeCiJobs({ jobs: [{ ...jobs.jobs[0], conclusion: "failure" }] }),
  /failed job/,
);
assert(
  !safeFailure(
    'password: private-fixture-password\n{"DB_PASSWORD":"private-db-password"}',
  ).includes("private-"),
);
console.log(
  "PASS: all 61 original regression commands/arguments/environment retained once; extra resource test present; missing/duplicate coverage and failed timing comparisons rejected; secrets redacted",
);

const root = resolve(import.meta.dirname, "..");
const local = join(root, ".local");
await mkdir(local, { recursive: true });
const directory = await mkdtemp(join(local, "ci-runner-test-"));
try {
  const passing = join(directory, "passing.mjs"),
    failing = join(directory, "failing.mjs");
  await writeFile(
    passing,
    'console.log("Cookie: " + "private-truncated-secret".repeat(6000)); console.log("owned fixture passed")',
  );
  await writeFile(
    failing,
    'console.error("password: private-runner-password\\nCookie: private-runner-cookie"); process.exitCode = 7',
  );
  const tests = [passing, failing, passing].map((script) => ({
    script,
    args: [],
    env: {},
  }));
  const result = await runCiSuite({ root, directory, shard: "fixture", tests });
  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.tests.map((test) => test.status),
    ["passed", "failed", "not-run"],
  );
  assert.equal(result.tests[1].exitCode, 7);
  assert.equal(result.tests[0].outputTruncated, true);
  assert.equal(
    await readFile(join(directory, "passing.log"), "utf8"),
    "owned fixture passed\n",
  );
  const log = await readFile(join(directory, "failing.log"), "utf8");
  assert(!log.includes("private-runner-"));
  assert.deepEqual(
    JSON.parse(await readFile(join(directory, "summary.json"), "utf8")),
    result,
  );
  console.log(
    "PASS: actual child failure persists its exit code and redacted logs; remaining checks stay not-run",
  );
} finally {
  assert.equal(
    dirname(await realpath(directory)).toLowerCase(),
    (await realpath(local)).toLowerCase(),
  );
  await rm(directory, { recursive: true, force: true });
}
