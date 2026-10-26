import { describe, it, expect } from "vitest";
import {
  localInstant,
  calendarWindows,
  type CalendarConfig,
} from "../../services/productionCalendar.js";
import { counterDeltas } from "../../services/shiftCalculation.js";
import {
  calculateEnergy,
  type EnergySample,
} from "../../services/energyAnalysis.js";
import type { ProductionProfile } from "@performance-dashboard/shared";
const signal = {
  nodeKey: "Count",
  namespaceUri: "urn:fixture",
  identifier: "s=count",
  dataType: "Double",
  unit: "kWh",
  scale: 1,
};
const profile: ProductionProfile = {
  version: 1,
  name: "Fixture",
  endpointModel: "Owned",
  signals: { state: signal, total: signal },
  states: { running: [1], idle: [0], fault: [2], planned: [3] },
  idealCycleMs: 1000,
  maxGapSeconds: 60,
  counterPolicy: "rollover",
  counterModulus: 1000,
};
const start = new Date("2026-01-01T00:00:00Z"),
  end = new Date("2026-01-01T00:01:00Z");
describe("calendar boundaries", () => {
  it("rejects spring gaps and ambiguous autumn starts until explicitly resolved", () => {
    expect(() =>
      localInstant("2026-03-29", "02:30", "Europe/Berlin", "reject"),
    ).toThrow("does not exist");
    expect(() =>
      localInstant("2026-10-25", "02:30", "Europe/Berlin", "reject"),
    ).toThrow("occurs twice");
    expect(
      localInstant(
        "2026-10-25",
        "02:30",
        "Europe/Berlin",
        "earlier",
      ).toISOString(),
    ).toBe("2026-10-25T00:30:00.000Z");
    expect(
      localInstant(
        "2026-10-25",
        "02:30",
        "Europe/Berlin",
        "later",
      ).toISOString(),
    ).toBe("2026-10-25T01:30:00.000Z");
  });
  it("skips holidays and respects elapsed shift length over daylight saving", () => {
    const config: CalendarConfig = {
      name: "Night",
      timezone: "Europe/Berlin",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: "22:00",
      durationMinutes: 480,
      holidays: ["2026-10-24"],
      fold: "reject",
      breaks: [],
      job: { reference: "A", product: "P", target: null },
    };
    const windows = calendarWindows(config, "2026-10-23", "2026-10-25");
    expect(windows).toHaveLength(2);
    expect(
      windows.every(
        (w) => Date.parse(w.end) - Date.parse(w.start) === 480 * 60000,
      ),
    ).toBe(true);
  });
});
it("counts a declared rollover but does not disguise a mid-range reset or invalid modulus", () => {
  const points = (a: number, b: number) => [
    { timestamp: start, value: a, statusCode: "Good" },
    { timestamp: end, value: b, statusCode: "Good" },
  ];
  expect(counterDeltas(points(998, 3), profile, 1, start, end)).toEqual({
    count: 5,
    complete: true,
  });
  expect(counterDeltas(points(500, 3), profile, 1, start, end)).toEqual({
    count: null,
    complete: false,
  });
  expect(counterDeltas(points(1000, 3), profile, 1, start, end)).toEqual({
    count: null,
    complete: false,
  });
});
it("preserves meter gaps, source identity, resets and state attribution", () => {
  const point = (
    timestamp: Date,
    value: number,
    status_code = "Good",
  ): EnergySample => ({
    timestamp,
    value,
    status_code,
    signal_metadata: signal,
  });
  const meter = { signal, maxGapSeconds: 60, modulus: null };
  const idle = [
    {
      start: start.toISOString(),
      end: end.toISOString(),
      state: "idle" as const,
    },
  ];
  expect(
    calculateEnergy(
      [point(start, 10), point(end, 13)],
      meter,
      start,
      end,
      idle,
    ),
  ).toEqual({
    observedKWh: 3,
    idleKWh: 3,
    unassignedKWh: 0,
    coveredSeconds: 60,
    complete: true,
  });
  expect(
    calculateEnergy(
      [point(start, 10), point(end, 13, "Bad")],
      meter,
      start,
      end,
      idle,
    ).observedKWh,
  ).toBeNull();
  expect(
    calculateEnergy([point(start, 10), point(end, 2)], meter, start, end, idle)
      .complete,
  ).toBe(false);
  expect(
    calculateEnergy([point(start, 10), point(end, 13)], meter, start, end, [])
      .unassignedKWh,
  ).toBe(3);
  expect(
    calculateEnergy(
      [
        point(start, 10),
        { ...point(end, 13), signal_metadata: { namespaceUri: "other" } },
      ],
      meter,
      start,
      end,
      idle,
    ).observedKWh,
  ).toBeNull();
});
