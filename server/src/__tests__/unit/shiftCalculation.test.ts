import { describe, it, expect } from "vitest";
import {
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
