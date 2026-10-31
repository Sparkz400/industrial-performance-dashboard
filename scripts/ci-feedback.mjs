import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
export async function loadCiSuites() {
  const manifest = JSON.parse(
    await readFile(new URL("scripts/ci-suites.json", root), "utf8"),
  );
  const baseline = JSON.parse(
    await readFile(new URL("benchmarks/ci-baseline.json", root), "utf8"),
  );
  validateCiSuites(manifest, baseline);
  for (const test of Object.values(manifest.shards).flat())
    await access(new URL(test.script, root));
  return { manifest, baseline };
}

export function validateCiSuites(manifest, baseline) {
  assert.equal(manifest.format, "pd-ci-suites-v1");
  assert.equal(baseline.format, "pd-ci-baseline-v1");
  assert.deepEqual(Object.keys(manifest.shards).sort(), ["1", "2", "3", "4"]);
  const tests = Object.values(manifest.shards).flat();
  assert.equal(
    new Set(tests.map((test) => test.script)).size,
    tests.length,
    "Duplicate CI suite",
  );
  for (const test of tests) {
    assert.match(test.script, /^scripts\/test-[a-z0-9-]+\.mjs$/);
    assert(
      Array.isArray(test.args) &&
        test.args.every((arg) => typeof arg === "string"),
    );
    assert.deepEqual(
      test.env,
      test.script === "scripts/test-daily-workflows.mjs"
        ? { DAILY_BROWSER: "1" }
        : {},
    );
  }
  for (const required of baseline.requiredBrowserTests)
    assert.deepEqual(
      tests.find((test) => test.script === required.script),
      required,
      `Required CI coverage changed: ${required.script}`,
    );
  assert(
    tests.some((test) => test.script === "scripts/test-browser-resources.mjs"),
    "Browser resource regression is required",
  );
  return tests.length;
}

export function summarizeCiJobs(payload) {
  assert(Array.isArray(payload.jobs) && payload.jobs.length > 0);
  if (payload.total_count !== undefined)
    assert.equal(
      payload.jobs.length,
      payload.total_count,
      "Incomplete job metadata; fetch every page",
    );
  const jobs = payload.jobs.map((job) => {
    assert.equal(
      job.conclusion,
      "success",
      `Cannot compare incomplete/failed job: ${job.name}`,
    );
    const start = Date.parse(job.started_at),
      end = Date.parse(job.completed_at);
    assert(Number.isFinite(start) && end >= start);
    return { name: job.name, seconds: (end - start) / 1000, start, end };
  });
  return {
    jobs: jobs.map(({ name, seconds }) => ({ name, seconds })),
    wallSeconds:
      (Math.max(...jobs.map((j) => j.end)) -
        Math.min(...jobs.map((j) => j.start))) /
      1000,
    runnerSeconds: jobs.reduce((sum, job) => sum + job.seconds, 0),
    scope:
      "From first job start to last job completion; excludes time queued before the first job",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    assert.equal(
      process.argv.length,
      3,
      "Usage: node scripts/ci-feedback.mjs github-jobs.json",
    );
    const { baseline } = await loadCiSuites();
    const current = summarizeCiJobs(
      JSON.parse(await readFile(process.argv[2], "utf8")),
    );
    console.log(
      JSON.stringify(
        {
          baseline: {
            runUrl: baseline.runUrl,
            sourceRevision: baseline.sourceRevision,
            wallSeconds: baseline.wallSeconds,
            runnerSeconds: baseline.runnerSeconds,
          },
          current,
          wallChangePercent:
            100 * (current.wallSeconds / baseline.wallSeconds - 1),
          runnerChangePercent:
            100 * (current.runnerSeconds / baseline.runnerSeconds - 1),
          limitation:
            "Single-run observations on hosted runners, not a guaranteed speedup; current coverage includes new benchmark/resource checks",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
