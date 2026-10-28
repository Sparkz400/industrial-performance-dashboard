import { describe, it, expect } from "vitest";
import type { ProductionProfile } from "@performance-dashboard/shared";
import { calculateShift } from "../../services/shiftCalculation.js";
import {
  comparePeriods,
  type FrozenRevision,
} from "../../services/periodComparison.js";

function revision(id: number, total = 30, good = 27): FrozenRevision {
  const start = new Date(`2026-01-0${id}T00:00:00Z`),
    end = new Date(start.getTime() + 60000);
  const signal = (nodeKey: string) => ({
    nodeKey,
    namespaceUri: "urn:fixture",
    identifier: `s=${nodeKey}`,
    dataType: "Double",
    unit: null,
    scale: 1,
  });
  const profile: ProductionProfile = {
    version: 1,
    name: "Fixture",
    endpointModel: "Owned",
    signals: {
      state: signal("state"),
      total: signal("total"),
      good: signal("good"),
      reject: signal("reject"),
    },
    states: { running: [1], idle: [0], fault: [2], planned: [3] },
    idealCycleMs: 1000,
    maxGapSeconds: 20,
    counterPolicy: "reject-decrease",
  };
  const points = (count: number, state = false) =>
    [0, 20, 40, 60].map((t) => ({
      timestamp: new Date(start.getTime() + t * 1000),
      value: state ? 1 : (count * t) / 60,
      statusCode: "Good",
    }));
  const snapshot = calculateShift({
    id,
    machineId: 1,
    name: "Shift",
    timezone: "UTC",
    start,
    end,
    profile,
    job: { reference: `Order-${id}`, product: "A", target: 60 },
    breaks: [],
    reasons: [],
    evidence: {
      total,
      good,
      reject: total - good,
      reference: "Independent",
      actorId: 1,
    },
    samples: {
      state: points(1, true),
      total: points(total),
      good: points(good),
      reject: points(total - good),
    },
  });
  return { id, createdAt: end, createdBy: 1, digest: "fixture", snapshot };
}
describe("frozen period comparisons", () => {
  it("does not treat missing or nonfinite quantities as comparable zero", () => {
    const a = revision(1),
      b = revision(2);
    b.snapshot.quantities.good = null;
    expect(comparePeriods(a, b, [1, 2]).reasons).toContain("unverified");
    b.snapshot.quantities.good = Number.POSITIVE_INFINITY;
    const result = comparePeriods(a, b, [1, 2]);
    expect(result.reasons).toContain("unverified");
    expect(result.metrics[0].after).toBeNull();
  });
  it("compares independently reconciled evidence and reports percentage points", () => {
    const a = revision(1),
      b = revision(2, 40, 38),
      result = comparePeriods(a, b, [3, 2]);
    expect(result.comparable).toBe(true);
    expect(result.before.latestRevisionId).toBe(3);
    expect(result.metrics.find((m) => m.key === "goodPerHour")?.delta).toBe(
      660,
    );
    expect(result.metrics.find((m) => m.key === "quality")?.delta).toBe(5);
    expect(
      result.metrics.find((m) => m.key === "kWhPerGoodPart")?.delta,
    ).toBeNull();
    expect(a.snapshot.quantities.good).toBe(27);
  });
  it("withholds changes for observed counter resets or gaps even when numeric totals exist", () => {
    const a = revision(1),
      b = revision(2);
    b.snapshot.issues.push(
      "good counter has gaps, a decrease, or unsampled shift boundaries; quantity is only observed deltas.",
    );
    b.snapshot.verified = false;
    const result = comparePeriods(a, b, [1, 2]);
    expect(result.comparable).toBe(false);
    expect(result.metrics.every((m) => m.delta === null)).toBe(true);
    expect(result.after.report.quantities.good).toBe(27);
  });
  it("exposes unknown coverage and changed schedules without inventing downtime", () => {
    const a = revision(1),
      b = revision(2);
    b.snapshot.seconds.unknown = 10;
    b.snapshot.observedSeconds = 50;
    b.snapshot.scheduledSeconds = 50;
    const result = comparePeriods(a, b, [1, 2]);
    expect(result.reasons).toContain("coverage");
    expect(result.reasons).toContain("schedule");
    expect(
      result.metrics.find((m) => m.key === "idleFaultSeconds")?.after,
    ).toBe(0);
    expect(result.metrics.every((m) => m.delta === null)).toBe(true);
  });
  it("blocks different products and cycle standards but permits different order references", () => {
    const a = revision(1),
      b = revision(2);
    expect(comparePeriods(a, b, [1, 2]).comparable).toBe(true);
    b.snapshot.job.product = "B";
    expect(comparePeriods(a, b, [1, 2]).reasons).toContain("product-mix");
    b.snapshot.job.product = "A";
    b.snapshot.profile.idealCycleMs = 2000;
    expect(comparePeriods(a, b, [1, 2]).reasons).toContain("product-mix");
  });
  it("retains corrections and requires identical signal and counter definitions", () => {
    const a = revision(1),
      b = revision(2);
    b.snapshot.profile.counterPolicy = "rollover";
    b.snapshot.profile.counterModulus = 100;
    b.snapshot.reasons = [
      {
        id: 2,
        start: b.snapshot.start,
        end: b.snapshot.end,
        category: "unplanned",
        reason: "Corrected stop",
        actorId: 3,
        createdAt: b.snapshot.end,
        supersedesId: 1,
      },
    ];
    const result = comparePeriods(a, b, [1, 2]);
    expect(result.reasons).toContain("definitions");
    expect(result.after.report.reasons[0].actorId).toBe(3);
  });
  it("compares only complete frozen energy under the same meter definition", () => {
    const a = revision(1),
      b = revision(2),
      meter = { signal: { unit: "kWh", scale: 1 }, maxGapSeconds: 60 };
    a.snapshot.energy = {
      configured: true,
      complete: true,
      meter,
      kWhPerGoodPart: 2,
    };
    b.snapshot.energy = {
      configured: true,
      complete: true,
      meter,
      kWhPerGoodPart: 1.5,
    };
    expect(comparePeriods(a, b, [1, 2]).metrics.at(-1)?.delta).toBe(-0.5);
    b.snapshot.energy.meter = { ...meter, maxGapSeconds: 30 };
    expect(comparePeriods(a, b, [1, 2]).metrics.at(-1)?.reasons).toContain(
      "energy-definition",
    );
    b.snapshot.energy.complete = false;
    expect(comparePeriods(a, b, [1, 2]).metrics.at(-1)?.after).toBeNull();
  });
  it("rejects overlapping, reversed and cross-machine periods", () => {
    const a = revision(1),
      b = revision(2);
    expect(() => comparePeriods(b, a, [2, 1])).toThrow("non-overlapping");
    b.snapshot.machineId = 2;
    expect(() => comparePeriods(a, b, [1, 2])).toThrow("same machine");
    expect(() => comparePeriods(a, a, [1, 1])).toThrow("different");
  });
  it("blocks unfinished and unassigned product-run periods", () => {
    const a = revision(1),
      b = revision(2);
    b.snapshot.generatedAt = b.snapshot.start;
    b.snapshot.runs = [
      {
        plan: {
          start: b.snapshot.start,
          end: b.snapshot.end,
          reference: "A",
          product: "A",
          target: 30,
          idealCycleMs: 1000,
        },
        report: { ...b.snapshot, scheduledSeconds: 30 },
      },
    ];
    const result = comparePeriods(a, b, [1, 2]);
    expect(result.reasons).toContain("unfinished");
    expect(result.reasons).toContain("product-mix");
    expect(result.after.unassignedScheduledSeconds).toBe(30);
  });
});
