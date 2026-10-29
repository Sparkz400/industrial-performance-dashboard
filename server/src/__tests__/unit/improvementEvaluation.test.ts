import { expect, it } from "vitest";
import { evaluateImprovement } from "../../services/improvementEvaluation.js";
import type { ComparisonSnapshot } from "../../services/periodComparison.js";

const hour = 3600;
const shift = (
  day: number,
  patch: {
    good?: number;
    availability?: number;
    idle?: number;
    product?: string;
    kWh?: number | null;
  } = {},
): ComparisonSnapshot => {
  const good = patch.good ?? 2880;
  return {
    revision: "shift-v1",
    id: day,
    machineId: 1,
    name: `Day ${day}`,
    timezone: "UTC",
    start: new Date(Date.UTC(2026, 4, day, 6)).toISOString(),
    end: new Date(Date.UTC(2026, 4, day, 14)).toISOString(),
    generatedAt: new Date(Date.UTC(2026, 4, day, 15)).toISOString(),
    profile: {
      version: 1,
      name: "P",
      endpointModel: "fixture",
      signals: {},
      states: { running: [1], idle: [0], fault: [2], planned: [3] },
      idealCycleMs: 1000,
      maxGapSeconds: 60,
      counterPolicy: "reset-to-zero",
    },
    job: { reference: "J", product: patch.product ?? "Bracket", target: null },
    intervals: [],
    reasons: [],
    seconds: {
      running: 6 * hour,
      idle: patch.idle ?? hour,
      fault: 0,
      planned: 0,
      unknown: 0,
    },
    scheduledSeconds: 8 * hour,
    plannedSeconds: 0,
    observedSeconds: 8 * hour,
    quantities: { total: good, good, reject: 0 },
    oee: {
      availability: patch.availability ?? 0.8,
      performance: 0.5,
      quality: 1,
      overall: 0.4,
    },
    losses: [],
    issues: [],
    evidence: null,
    verified: true,
    energy:
      patch.kWh === null
        ? {
            configured: true,
            complete: false,
            meter: { id: 1 },
            kWhPerGoodPart: null,
          }
        : {
            configured: true,
            complete: true,
            meter: { id: 1 },
            kWhPerGoodPart: patch.kWh ?? 0.5,
          },
  };
};
const action = new Date(Date.UTC(2026, 4, 10));

it("normalises per scheduled hour and reports deltas only for comparable sides", () => {
  const result = evaluateImprovement(
    action,
    [shift(1), shift(2)],
    [shift(11, { good: 3600, availability: 0.9, idle: 0.5 * hour, kWh: 0.45 })],
  );
  expect(result.comparable).toBe(true);
  const byKey = Object.fromEntries(result.metrics.map((m) => [m.key, m]));
  expect(byKey.goodPerScheduledHour).toMatchObject({
    before: 360,
    after: 450,
    delta: 90,
  });
  expect(byKey.availability.delta).toBeCloseTo(0.1);
  expect(byKey.idleFaultShare).toMatchObject({ before: 0.125, after: 0.0625 });
  expect(byKey.kWhPerGoodPart.delta).toBeCloseTo(-0.05);
  expect(result.context.before).toMatchObject({
    shifts: 2,
    scheduledHours: 16,
    meterCoverage: 1,
  });
});

it("keeps mix and coverage visible but withholds deltas they make unfair", () => {
  const mix = evaluateImprovement(
    action,
    [shift(1)],
    [shift(11, { product: "Housing" })],
  );
  expect(mix.reasons).toEqual(["product-mix"]);
  expect(mix.metrics.every((m) => m.delta === null)).toBe(true);
  expect(Object.values(mix.context.after.productMix)).toEqual([1]);

  const meter = evaluateImprovement(
    action,
    [shift(1)],
    [shift(11, { kWh: null }), shift(12)],
  );
  expect(meter.comparable).toBe(true);
  expect(meter.context.after.meterCoverage).toBe(0.5);
  const energy = meter.metrics.find((m) => m.key === "kWhPerGoodPart")!;
  expect(energy).toMatchObject({
    after: null,
    delta: null,
    reasons: ["energy-unavailable"],
  });
  expect(meter.metrics.find((m) => m.key === "availability")!.delta).toBe(0);

  const late = evaluateImprovement(action, [shift(1), shift(12)], [shift(13)]);
  expect(late.reasons).toContain("timing");
});
