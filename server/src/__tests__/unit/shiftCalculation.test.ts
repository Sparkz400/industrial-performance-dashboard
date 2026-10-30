import { describe, it, expect, vi } from "vitest";
import {
  applyManualStates,
  calculateShift,
  stateTimeline,
  counterDeltas,
} from "../../services/shiftCalculation.js";
import { validateProfile } from "../../services/commissioningService.js";
import type { ProductionProfile } from "@performance-dashboard/shared";

const signal = (nodeKey: string) => ({
  nodeKey,
  namespaceUri: "urn:owned",
  identifier: `s=${nodeKey}`,
  dataType: "Int32",
  scale: 1,
  unit: null,
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
const start = new Date("2026-01-01T00:00:00Z"),
  end = new Date("2026-01-01T00:01:00Z");
const point = (second: number, value: number | null, statusCode = "Good") => ({
  timestamp: new Date(start.getTime() + second * 1000),
  value,
  statusCode,
});

describe("shift calculation", () => {
  it("reconciles a known shift without clamping inputs and preserves stop reasons", () => {
    const report = calculateShift({
      id: 1,
      machineId: 2,
      name: "One minute",
      timezone: "UTC",
      start,
      end,
      profile,
      job: { reference: "J1", product: "P1", target: 30 },
      breaks: [],
      evidence: {
        total: 30,
        good: 27,
        reject: 3,
        reference: "Independent fixture",
        actorId: 1,
      },
      reasons: [
        {
          id: 1,
          start: point(30, 0).timestamp.toISOString(),
          end: end.toISOString(),
          reason: "Jam",
          category: "unplanned",
          actorId: 1,
          createdAt: end.toISOString(),
          supersedesId: null,
        },
      ],
      samples: {
        state: [
          point(0, 1),
          point(15, 1),
          point(30, 2),
          point(45, 2),
          point(60, 1),
        ],
        total: [
          point(0, 0),
          point(15, 15),
          point(30, 30),
          point(45, 30),
          point(60, 30),
        ],
        good: [
          point(0, 0),
          point(15, 14),
          point(30, 27),
          point(45, 27),
          point(60, 27),
        ],
        reject: [
          point(0, 0),
          point(15, 1),
          point(30, 3),
          point(45, 3),
          point(60, 3),
        ],
      },
    });
    expect(report.verified).toBe(true);
    expect(report.oee).toEqual({
      availability: 0.5,
      performance: 1,
      quality: 0.9,
      overall: 0.45,
    });
    expect(report.losses).toEqual([{ reason: "Jam", seconds: 30 }]);
  });
  it("caps stale state, never classifies a disconnect as a stopped machine", () => {
    const intervals = stateTimeline(
      [point(0, 1), point(40, 2, "BadNoCommunication"), point(50, 0)],
      profile,
      start,
      end,
    );
    expect(intervals).toEqual([
      {
        start: start.toISOString(),
        end: point(20, 0).timestamp.toISOString(),
        state: "running",
      },
      {
        start: point(20, 0).timestamp.toISOString(),
        end: point(50, 0).timestamp.toISOString(),
        state: "unknown",
      },
      {
        start: point(50, 0).timestamp.toISOString(),
        end: end.toISOString(),
        state: "idle",
      },
    ]);
  });
  it("withholds performance when running overlaps an excluded break", () => {
    const samples = [
      point(0, 1),
      point(15, 1),
      point(30, 1),
      point(45, 1),
      point(60, 1),
    ];
    const report = calculateShift({
      id: 1,
      machineId: 2,
      name: "Break conflict",
      timezone: "UTC",
      start,
      end,
      profile,
      job: { reference: "", product: "", target: null },
      breaks: [
        {
          start: start.toISOString(),
          end: point(15, 0).timestamp.toISOString(),
        },
      ],
      reasons: [],
      evidence: null,
      samples: { state: samples, total: samples },
    });
    expect(report.plannedSeconds).toBe(15);
    expect(report.oee.availability).toBe(1);
    expect(report.oee.performance).toBeNull();
    expect(report.oee.overall).toBeNull();
    expect(report.issues).toContain(
      "Running overlaps an excluded break; revise the schedule before calculating performance and OEE.",
    );
  });
  it("does not count cross-boundary deltas, bad-quality gaps or unapproved counter decreases", () => {
    expect(
      counterDeltas(
        [
          point(-1, 100),
          point(10, 110),
          point(20, 115),
          point(30, 0),
          point(60, 10),
        ],
        profile,
        1,
        start,
        end,
      ),
    ).toEqual({ count: 5, complete: false });
    expect(
      counterDeltas(
        [point(0, 100), point(10, null, "Bad"), point(20, 120)],
        profile,
        1,
        start,
        point(20, 0).timestamp,
      ),
    ).toEqual({ count: null, complete: false });
    expect(
      counterDeltas(
        [point(0, 100), point(10, 5)],
        { ...profile, counterPolicy: "reset-to-zero" },
        1,
        start,
        point(10, 0).timestamp,
      ),
    ).toEqual({ count: 5, complete: true });
  });
  it("uses actual elapsed hours across daylight-saving boundaries", () => {
    const spring = stateTimeline(
      [],
      profile,
      new Date("2026-03-29T00:00:00+01:00"),
      new Date("2026-03-29T08:00:00+02:00"),
    );
    const autumn = stateTimeline(
      [],
      profile,
      new Date("2026-10-25T00:00:00+02:00"),
      new Date("2026-10-25T08:00:00+01:00"),
    );
    expect(
      (Date.parse(spring[0].end) - Date.parse(spring[0].start)) / 3600000,
    ).toBe(7);
    expect(
      (Date.parse(autumn[0].end) - Date.parse(autumn[0].start)) / 3600000,
    ).toBe(9);
  });
  it("rejects ambiguous profiles instead of guessing state or counter identity", () => {
    expect(() =>
      validateProfile({ ...profile, states: { ...profile.states, idle: [1] } }),
    ).toThrow("overlap");
    expect(() =>
      validateProfile({
        ...profile,
        signals: { state: profile.signals.state, total: profile.signals.state },
      }),
    ).toThrow("distinct");
  });
});

describe("reviewed manual quantity declarations", () => {
  // Samples every 15 s stay within the profile's 20 s maximum gap.
  const series = (values: (number | null)[]) =>
    values.map((value, i) => point(i * 15, value));
  const counters = (total: (number | null)[]) => ({
    state: series([1, 1, 1, 1, 1]),
    total: series(total),
    good: series([0, 2, 4, 7, 9]),
    reject: series([0, 0, 1, 1, 1]),
  });
  const shift = (samples: ReturnType<typeof counters>, declared: boolean) =>
    calculateShift({
      id: 1,
      machineId: 2,
      name: "Declared",
      timezone: "UTC",
      start,
      end,
      profile,
      job: { reference: "J1", product: "P1", target: null },
      breaks: [],
      evidence: null,
      reasons: [],
      samples,
      declaration: declared
        ? {
            entryId: 7,
            total: 12,
            good: 11,
            reject: 1,
            reviewedAt: end.toISOString(),
          }
        : null,
    });

  it("fills incomplete counters, records the source and never verifies", () => {
    const report = shift(counters([0, 2, null, 8, 10]), true);
    expect(report.quantitySource).toBe("declaration");
    expect(report.quantities).toEqual({ total: 12, good: 11, reject: 1 });
    expect(report.oee.quality).toBeCloseTo(11 / 12);
    expect(report.issues).toContain(
      "Quantities come from reviewed manual declaration #7 because machine counters are incomplete.",
    );
    expect(report.verified).toBe(false);
  });

  it("keeps complete machine counts and reports a differing declaration", () => {
    const report = shift(counters([0, 2, 5, 8, 10]), true);
    expect(report.quantitySource).toBe("measured");
    expect(report.quantities).toEqual({ total: 10, good: 9, reject: 1 });
    expect(report.declaration?.entryId).toBe(7);
    expect(report.issues).toContain(
      "Reviewed manual declaration #7 differs from measured counts.",
    );
  });

  it("leaves incomplete counters unknown without a reviewed declaration", () => {
    const report = shift(counters([0, 2, null, 8, 10]), false);
    expect(report.quantitySource).toBe("measured");
    expect(report.declaration).toBeNull();
    expect(report.issues.join(" ")).not.toContain("declaration");
  });
});

describe("reviewed manual state declarations (O10)", () => {
  const at = (second: number) =>
    new Date(start.getTime() + second * 1000).toISOString();
  const declared = (
    entryId: number,
    from: number,
    to: number,
    state: "running" | "idle" | "fault" | "planned",
  ) => ({ entryId, start: at(from), end: at(to), state });

  it("matches a per-second reference with nested, duplicate, clipped and zero-length declarations", () => {
    let seed = 731;
    const random = (n: number) =>
      (seed = (seed * 1664525 + 1013904223) >>> 0) % n;
    const states = ["running", "idle", "fault", "planned"] as const;
    for (let trial = 0; trial < 25; trial++) {
      const observed = Array.from({ length: 12 }, (_, i) => ({
        start: at(i * 5),
        end: at(i * 5 + 5),
        state: random(3) ? ("unknown" as const) : states[random(4)],
      }));
      const manual = Array.from({ length: 40 }, (_, i) => {
        const from = random(80) - 10;
        return declared(i, from, from + random(30), states[random(4)]);
      });
      manual.push(
        declared(50, -10, 70, "running"),
        declared(51, 10, 20, "running"),
      );
      const actual = applyManualStates(observed, manual, start, end);
      let manualSeconds = 0,
        conflictSeconds = 0,
        contradictedSeconds = 0;
      for (let second = 0; second < 60; second++) {
        const covers = (i: { start: string; end: string }) =>
          i.start <= at(second) && i.end >= at(second + 1);
        const measured = observed.find(covers)!.state;
        const declarations = new Set(manual.filter(covers).map((m) => m.state));
        const interval = actual.intervals.find(covers)!;
        const isManual = measured === "unknown" && declarations.size === 1;
        expect(interval.state).toBe(isManual ? [...declarations][0] : measured);
        expect(interval.source).toBe(isManual ? "manual" : undefined);
        manualSeconds += Number(isManual);
        conflictSeconds += Number(
          measured === "unknown" && declarations.size > 1,
        );
        contradictedSeconds += Number(
          measured !== "unknown" &&
            [...declarations].some((s) => s !== measured),
        );
      }
      expect(actual).toMatchObject({
        manualSeconds,
        conflictSeconds,
        contradictedSeconds,
      });
    }
  });

  it("handles 10,000 boundaries without reparsing every interval at each boundary", () => {
    const observed = Array.from({ length: 10000 }, (_, i) => ({
      start: at(i),
      end: at(i + 1),
      state: "unknown" as const,
    }));
    const manual = observed.map((_, i) => declared(i, i, i + 1, "running"));
    const parse = Date.parse;
    let calls = 0;
    const spy = vi.spyOn(Date, "parse").mockImplementation((value) => {
      if (++calls > 60000) throw new Error("Repeated timeline scan");
      return parse(value);
    });
    try {
      const result = applyManualStates(
        observed,
        manual,
        start,
        new Date(at(10000)),
      );
      expect(result.manualSeconds).toBe(10000);
      expect(result.intervals).toEqual([
        { start: at(0), end: at(10000), state: "running", source: "manual" },
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it("fills only unknown time, keeps observed states and leaves disagreement unknown", () => {
    const observed = [
      { start: at(0), end: at(20), state: "running" as const },
      { start: at(20), end: at(60), state: "unknown" as const },
    ];
    const result = applyManualStates(
      observed,
      [
        declared(1, 10, 30, "idle"), // 10 s contradict observed running, 10 s fill unknown
        declared(2, 30, 50, "running"),
        declared(3, 45, 55, "fault"), // disagrees with #2 for 5 s
      ],
      start,
      end,
    );
    expect(result.intervals).toEqual([
      { start: at(0), end: at(20), state: "running" },
      { start: at(20), end: at(30), state: "idle", source: "manual" },
      { start: at(30), end: at(45), state: "running", source: "manual" },
      { start: at(45), end: at(50), state: "unknown" },
      { start: at(50), end: at(55), state: "fault", source: "manual" },
      { start: at(55), end: at(60), state: "unknown" },
    ]);
    expect(result).toMatchObject({
      manualSeconds: 30,
      conflictSeconds: 5,
      contradictedSeconds: 10,
    });
  });

  it("supports a machine without a state signal but never verifies or completes it from gaps", () => {
    const manualProfile = validateProfile({
      ...profile,
      signals: {},
      states: undefined,
    });
    expect(manualProfile.signals.state).toBeUndefined();
    const report = (manualStates: ReturnType<typeof declared>[]) =>
      calculateShift({
        id: 1,
        machineId: 2,
        name: "Manual",
        timezone: "UTC",
        start,
        end,
        profile: manualProfile,
        job: { reference: "J1", product: "P1", target: null },
        breaks: [],
        evidence: null,
        reasons: [],
        samples: {},
        manualStates,
        declaration: {
          entryId: 9,
          total: 30,
          good: 29,
          reject: 1,
          reviewedAt: end.toISOString(),
        },
      });
    const partial = report([declared(1, 0, 30, "running")]);
    expect(partial.seconds).toMatchObject({ running: 30, unknown: 30 });
    expect(partial.oee.availability).toBeNull();
    expect(partial.oee.overall).toBeNull();
    const full = report([
      declared(1, 0, 45, "running"),
      declared(2, 45, 60, "idle"),
    ]);
    expect(full.stateSource).toBe("manual");
    expect(full.manualStateSeconds).toBe(60);
    expect(full.oee.availability).toBeCloseTo(0.75);
    expect(full.quantitySource).toBe("declaration");
    expect(full.verified).toBe(false);
    expect(full.issues).toContain(
      "Reviewed manual state declarations fill 1.0 min of unknown machine state; they are declarations, not measurements.",
    );
  });
});
