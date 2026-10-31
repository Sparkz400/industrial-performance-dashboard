import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { canonicalJson } from "../server/src/utils/canonicalJson.ts";

const directory = new URL("../benchmarks/correctness/v1/", import.meta.url);
export async function loadCorrectnessSuite() {
  const inputs = JSON.parse(
    await readFile(new URL("cases.json", directory), "utf8"),
  );
  const expected = JSON.parse(
    await readFile(new URL("expected.json", directory), "utf8"),
  );
  assert.equal(inputs.format, "pd-correctness-input-v1");
  assert.equal(expected.format, "pd-correctness-expected-v1");
  assert.equal(inputs.suite, "shift-v1");
  assert.equal(expected.suite, inputs.suite);
  assert.equal(inputs.cases.length, 15, "Version 1 has 15 published cases");
  const ids = inputs.cases.map((test) => test.id);
  assert.equal(new Set(ids).size, ids.length, "Duplicate case identifier");
  assert.deepEqual(Object.keys(expected.cases).sort(), [...ids].sort());
  assert.equal(expected.absoluteTolerance, 1e-9);
  for (const test of inputs.cases) {
    assert.match(test.id, /^[a-z][a-z0-9-]{1,70}$/);
    assert(test.title && expected.cases[test.id].reasoning);
    const input = test.input;
    const elapsed = Date.parse(input.end) - Date.parse(input.start);
    assert(elapsed > 0 && elapsed <= 48 * 3600000);
    assert(Number.isFinite(Date.parse(input.asOf)));
    assert(input.deliveries.length > 0 && input.deliveries.length <= 10000);
    for (const row of input.deliveries) {
      assert.match(row.id, /^[A-Za-z0-9:_-]{1,100}$/);
      assert(Object.hasOwn(input.profile.signals, row.signal));
      assert(Number.isFinite(Date.parse(row.at)));
      assert(row.value === null || Number.isFinite(row.value));
      assert.equal(typeof row.quality, "string");
    }
  }
  return {
    inputs,
    expected,
    datasetSha256: createHash("sha256")
      .update(canonicalJson(inputs))
      .digest("hex"),
  };
}

export function compareCorrectness(suite, actual) {
  assert.equal(actual.format, "pd-correctness-result-v1");
  assert.equal(actual.suite, suite.inputs.suite);
  assert.equal(
    actual.datasetSha256,
    suite.datasetSha256,
    "Results use different inputs",
  );
  assert(Array.isArray(actual.results));
  assert.equal(
    actual.results.length,
    suite.inputs.cases.length,
    "Missing or extra results",
  );
  const results = new Map(
    actual.results.map((result) => [result.id, result.result]),
  );
  assert.equal(
    results.size,
    actual.results.length,
    "Duplicate result identifier",
  );
  assert.deepEqual(
    [...results.keys()].sort(),
    Object.keys(suite.expected.cases).sort(),
  );
  const failures = [];
  const compare = (wanted, value, path) => {
    if (typeof wanted === "number") {
      if (
        !Number.isFinite(value) ||
        Math.abs(wanted - value) > suite.expected.absoluteTolerance
      )
        failures.push({ path, expected: wanted, actual: value ?? null });
    } else if (wanted !== null && typeof wanted === "object") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        failures.push({ path, expected: "object", actual: value ?? null });
        return;
      }
      if (
        Object.keys(wanted).sort().join("\n") !==
        Object.keys(value).sort().join("\n")
      )
        failures.push({
          path,
          expected: Object.keys(wanted).sort(),
          actual: Object.keys(value).sort(),
        });
      for (const [key, item] of Object.entries(wanted))
        compare(item, value[key], `${path}.${key}`);
    } else if (value !== wanted) {
      failures.push({ path, expected: wanted, actual: value ?? null });
    }
  };
  for (const [id, answer] of Object.entries(suite.expected.cases))
    compare(answer.result, results.get(id), id);
  return { passed: failures.length === 0, cases: results.size, failures };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { values } = parseArgs({
      options: {
        results: { type: "string" },
        out: { type: "string" },
      },
    });
    const suite = await loadCorrectnessSuite();
    let actual;
    if (values.results) {
      assert(
        (await stat(values.results)).size <= 1024 * 1024,
        "Results exceed 1 MiB",
      );
      actual = JSON.parse(await readFile(values.results, "utf8"));
    } else {
      const { dashboardResult } = await import("./correctness-adapter.mjs");
      actual = {
        format: "pd-correctness-result-v1",
        suite: suite.inputs.suite,
        datasetSha256: suite.datasetSha256,
        implementation: "Performance Dashboard source checkout",
        results: suite.inputs.cases.map(({ id, input }) => ({
          id,
          result: dashboardResult(input),
        })),
      };
    }
    const comparison = compareCorrectness(suite, actual);
    const report = { ...actual, comparison };
    if (values.out) {
      await mkdir(dirname(resolve(values.out)), { recursive: true });
      await writeFile(values.out, JSON.stringify(report, null, 2) + "\n");
    }
    console.log(JSON.stringify(comparison, null, 2));
    if (!comparison.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
