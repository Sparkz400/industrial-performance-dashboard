import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  calculateShift,
  applyProductRuns,
} from "../server/src/services/shiftCalculation.ts";
import { canonicalJson } from "../server/src/utils/canonicalJson.ts";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const view = (value) =>
  JSON.parse(canonicalJson(value), (key, item) =>
    ["generatedAt", "measurementEvidence", "planVersion"].includes(key)
      ? undefined
      : item,
  );

export async function verifyShiftEvidence(bundle) {
  const { payload, sha256 } = bundle;
  assert.equal(
    payload?.format,
    "performance-dashboard-shift-evidence-v1",
    "Unsupported evidence format",
  );
  assert.equal(hash(canonicalJson(payload)), sha256, "Evidence hash mismatch");
  assert.equal(
    payload.calculatorSha256,
    hash(
      (
        await readFile(
          new URL(
            "../server/src/services/shiftCalculation.ts",
            import.meta.url,
          ),
          "utf8",
        )
      ).replace(/\r\n/g, "\n"),
    ),
    "Calculator differs: use the exporter source revision",
  );
  assert(
    Array.isArray(payload.calculations) &&
      payload.calculations.length >= 1 &&
      payload.calculations.length <= 101,
    "Invalid calculation count",
  );
  assert(
    payload.calculations.reduce(
      (n, input) =>
        n +
        Object.values(input.samples).reduce(
          (count, rows) => count + rows.length,
          0,
        ),
      0,
    ) <= 100000,
    "Excessive input samples",
  );
  const computed = payload.calculations.map((input) => {
    const start = new Date(input.start),
      end = new Date(input.end);
    assert(
      Number.isFinite(+start) && end > start && end - start <= 48 * 3600000,
      "Invalid shift window",
    );
    assert(
      input.profile?.version === 1 && Object.keys(input.samples).length <= 4,
      "Invalid profile/samples",
    );
    assert(
      Array.isArray(input.breaks) &&
        input.breaks.length <= 1000 &&
        Array.isArray(input.reasons) &&
        input.reasons.length <= 1000,
      "Excessive reasons or breaks",
    );
    assert((input.manualStates ?? []).length <= 1000, "Excessive declarations");
    assert(
      Number.isFinite(input.profile.idealCycleMs) &&
        input.profile.idealCycleMs > 0 &&
        Number.isFinite(input.profile.maxGapSeconds) &&
        input.profile.maxGapSeconds >= 1,
      "Invalid cycle or gap",
    );
    assert(
      Object.values(input.profile.states).every(
        (values) =>
          Array.isArray(values) &&
          values.length <= 32 &&
          values.every(Number.isFinite),
      ),
      "Invalid state map",
    );
    const samples = Object.create(null);
    for (const signal of Object.values(input.profile.signals)) {
      const rows = input.samples[signal.nodeKey];
      assert(
        Array.isArray(rows) && rows.length <= 100001,
        "Missing or excessive samples",
      );
      let previous = -Infinity;
      samples[signal.nodeKey] = rows.map((row) => {
        const timestamp = new Date(row.timestamp);
        assert(
          Number.isFinite(+timestamp) &&
            +timestamp > previous &&
            timestamp <= end,
          "Invalid sample order/time",
        );
        previous = +timestamp;
        assert(
          row.recordedValue === null || Number.isFinite(row.recordedValue),
          "Invalid recorded value",
        );
        const value =
          row.signalMetadata?.namespaceUri === signal.namespaceUri &&
          row.signalMetadata.identifier === signal.identifier
            ? row.recordedValue
            : null;
        assert.equal(
          row.value,
          value,
          "Effective value differs from source identity",
        );
        return { ...row, timestamp, value };
      });
    }
    assert(Number.isFinite(Date.parse(input.asOf)), "Missing calculation time");
    return calculateShift({
      ...input,
      start,
      end,
      asOf: new Date(input.asOf),
      samples,
    });
  });
  const result = computed[0];
  const plans = payload.report.runs ?? [];
  assert.equal(
    computed.length,
    plans.length + 1,
    "Product-run inputs are missing",
  );
  if (plans.length) {
    result.runs = plans.map(({ plan }, index) => {
      const run = computed[index + 1];
      assert.equal(Date.parse(run.start), Date.parse(plan.start));
      assert.equal(Date.parse(run.end), Date.parse(plan.end));
      assert.equal(run.profile.idealCycleMs, plan.idealCycleMs);
      return { plan, report: run };
    });
    applyProductRuns(result);
  }
  assert.deepEqual(
    view(result),
    view(payload.report),
    "Stored report does not reproduce from its inputs",
  );
  return {
    reproduced: true,
    shiftId: result.id,
    oee: result.oee,
    issues: result.issues,
    revisionsReferenced: payload.revisions.length,
    authenticated: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    assert(
      process.argv.length === 3,
      "Usage: node scripts/verify-shift-evidence.mjs shift-evidence.json",
    );
    assert(
      (await stat(process.argv[2])).size <= 33 * 1024 * 1024,
      "Evidence exceeds 33 MiB",
    );
    console.log(
      JSON.stringify(
        await verifyShiftEvidence(
          JSON.parse(await readFile(process.argv[2], "utf8")),
        ),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
