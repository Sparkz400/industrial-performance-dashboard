import { expect, it } from "vitest";
import type { ProductionProfile } from "@performance-dashboard/shared";
import {
  rollupRemoved,
  type RemovedReading,
} from "../../services/historyRollup.js";
import {
  counterDeltas,
  stateTimeline,
} from "../../services/shiftCalculation.js";

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
  endpointModel: "fixture",
  signals: { state: signal("State"), total: signal("Count") },
  states: { running: [1], idle: [0], fault: [2], planned: [3] },
  idealCycleMs: 1000,
  maxGapSeconds: 120,
  counterPolicy: "reset-to-zero",
};
const t0 = Date.UTC(2026, 0, 1, 0, 58, 0);
type Sample = { at: number; value: number | null; status?: string };
const removed = (
  nodeKey: string,
  samples: Sample[],
  p = profile,
): RemovedReading[] =>
  samples.map((s, i) => ({
    machineId: 1,
    nodeKey,
    ts: new Date(t0 + s.at * 1000),
    value: s.value,
    statusCode: s.status ?? "Good",
    next: samples[i + 1]
      ? {
          ts: new Date(t0 + samples[i + 1].at * 1000),
          value: samples[i + 1].value,
          statusCode: samples[i + 1].status ?? "Good",
        }
      : null,
    profile: p,
  }));
const asShift = (samples: Sample[]) =>
  samples.map((s) => ({
    timestamp: new Date(t0 + s.at * 1000),
    value: s.value,
    statusCode: s.status ?? "Good",
  }));

it("keeps the same state seconds as the shift report, split by hour", () => {
  // Running 90 s across the 01:00 boundary, a fault, a bad reading, a gap beyond 120 s.
  const samples: Sample[] = [
    { at: 0, value: 1 },
    { at: 90, value: 2 },
    { at: 150, value: null, status: "BadSensorFailure" },
    { at: 200, value: 0 },
    { at: 600, value: 1 },
  ];
  const { states } = rollupRemoved(removed("State", samples));
  const end = new Date(t0 + (600 + 120) * 1000);
  const timeline = stateTimeline(
    asShift(samples) as never,
    profile,
    new Date(t0),
    end,
  );
  const reported: Record<string, number> = {};
  for (const i of timeline)
    if (i.state !== "unknown")
      reported[i.state] =
        (reported[i.state] ?? 0) +
        (Date.parse(i.end) - Date.parse(i.start)) / 1000;
  const kept: Record<string, number> = {};
  for (const s of states) kept[s.state] = (kept[s.state] ?? 0) + s.seconds;
  expect(kept).toEqual(reported);
  expect(kept).toEqual({ running: 210, fault: 60, idle: 120 });
  expect(
    states
      .filter((s) => s.state === "running")
      .map((s) => [s.bucket.slice(11, 16), s.seconds]),
  ).toEqual([
    ["00:00", 90],
    ["01:00", 120],
  ]);
  // One interval across 01:00 (00:59:30 to 01:00:30) is split 30 s / 30 s.
  const across = rollupRemoved(
    removed("State", [
      { at: 90, value: 1 },
      { at: 150, value: 1 },
    ]).slice(0, 1),
  ).states;
  expect(across.map((s) => [s.bucket.slice(11, 16), s.seconds])).toEqual([
    ["00:00", 30],
    ["01:00", 30],
  ]);
});

it("keeps counter increments with the profile's reset and gap rules", () => {
  const samples: Sample[] = [
    { at: 0, value: 10 },
    { at: 60, value: 15 },
    { at: 120, value: 3 }, // reset to zero: counts 3
    { at: 180, value: 8 },
    { at: 500, value: 9 }, // beyond 120 s: unknown
    { at: 560, value: -1 }, // invalid: unknown
  ];
  const { counters } = rollupRemoved(removed("Count", samples));
  const total = counters.reduce((n, c) => n + c.increment, 0);
  expect(total).toBe(
    counterDeltas(
      asShift(samples) as never,
      profile,
      1,
      new Date(t0),
      new Date(t0 + 560000),
    ).count,
  );
  expect(total).toBe(5 + 3 + 5);
  expect(counters.reduce((n, c) => n + c.unknownPairs, 0)).toBe(2);
  // A decrease under reject-decrease is unknown rather than a reset.
  const strict = rollupRemoved(
    removed("Count", samples.slice(0, 3), {
      ...profile,
      counterPolicy: "reject-decrease",
    }),
  ).counters;
  expect(strict.reduce((n, c) => n + c.increment, 0)).toBe(5);
  expect(strict.reduce((n, c) => n + c.unknownPairs, 0)).toBe(1);
});

it("ignores tags without a commissioned role or profile", () => {
  expect(
    rollupRemoved(
      removed("Temperature", [
        { at: 0, value: 1 },
        { at: 10, value: 2 },
      ]),
    ),
  ).toEqual({
    states: [],
    counters: [],
  });
  expect(
    rollupRemoved(
      removed(
        "State",
        [{ at: 0, value: 1 }],
        null as unknown as ProductionProfile,
      ),
    ).states,
  ).toEqual([]);
});
