import { expect, it } from "vitest";
import { hourWindows, plannedParts } from "../../services/hourlyPlan.js";

const at = (h: number, m = 0) =>
  new Date(Date.UTC(2026, 0, 1, h, m)).toISOString();

it("spreads a target over non-break time and plans nothing in a break", () => {
  const segments = [
    { start: at(6), end: at(9), target: 300, idealCycleMs: 1000 },
  ];
  const breaks = [{ start: at(7, 30), end: at(8) }];
  // 150 working minutes for 300 parts: 2 per minute.
  const plan = hourWindows(at(6), at(9)).map((w) =>
    plannedParts(w, segments, breaks),
  );
  expect(plan).toEqual([120, 60, 120]);
});

it("uses the ideal rate without a target, and each product run's own rate", () => {
  const segments = [
    { start: at(6), end: at(6, 30), target: null, idealCycleMs: 6000 },
    { start: at(6, 30), end: at(7), target: null, idealCycleMs: 3000 },
  ];
  // 30 min at 10/min + 30 min at 20/min.
  expect(plannedParts({ start: at(6), end: at(7) }, segments, [])).toBe(900);
});

it("cuts the last hour at the shift end", () => {
  expect(hourWindows(at(6), at(8, 15)).at(-1)).toEqual({
    start: at(8),
    end: at(8, 15),
  });
});
