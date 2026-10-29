import { expect, it } from "vitest";
import {
  chartPoints,
  referenceLimits,
  subgroups,
} from "../../services/controlCharts.js";

it("reproduces Montgomery's piston-ring X̄-R limits (X̿ = 74.001, R̄ = 0.023, n = 5)", () => {
  // Each reference subgroup has mean 74.001 and range 0.023.
  const reference = Array.from({ length: 25 }, () => [
    73.9895, 74.001, 74.001, 74.001, 74.0125,
  ]).flat();
  const { primary, secondary, points } = referenceLimits(
    "xbar-r",
    reference,
    5,
  );
  expect(points).toBe(25);
  expect(primary.center).toBeCloseTo(74.001, 6);
  expect(primary.ucl).toBeCloseTo(74.014, 3);
  expect(primary.lcl).toBeCloseTo(73.988, 3);
  expect(secondary).toMatchObject({ lcl: 0 });
  expect(secondary.center).toBeCloseTo(0.023, 6);
  expect(secondary.ucl).toBeCloseTo(0.0486, 4); // D4 = 2.114
});

it("builds I-MR limits from the average moving range", () => {
  // Alternating 10, 12: mean 11, every moving range 2.
  const reference = Array.from({ length: 22 }, (_, i) => (i % 2 ? 12 : 10));
  const { primary, secondary } = referenceLimits("individuals", reference);
  expect(primary.center).toBeCloseTo(11);
  expect(primary.ucl).toBeCloseTo(11 + 2.66 * 2);
  expect(primary.lcl).toBeCloseTo(11 - 2.66 * 2);
  expect(secondary.ucl).toBeCloseTo(3.267 * 2);
  const points = chartPoints(
    "individuals",
    [
      { at: "a", value: 11 },
      { at: "b", value: 17 }, // beyond 16.32
      { at: "c", value: null },
      { at: "d", value: 11 }, // range unknown after the gap, not 6
    ],
    { primary, secondary },
  );
  expect(points.map((p) => [p.value, p.range, p.outOfControl])).toEqual([
    [11, null, false],
    [17, 6, true],
    [11, null, false],
  ]);
});

it("forms subgroups from consecutive good readings only", () => {
  // The null discards the partial [1]; the trailing incomplete [6] is not a subgroup.
  const readings = [1, null, 2, 3, 4, 5, 6].map((value, i) => ({
    at: String(i),
    value,
  }));
  expect(subgroups(readings, 2).map((g) => g.map((r) => r.value))).toEqual([
    [2, 3],
    [4, 5],
  ]);
});

it("refuses limits it cannot support", () => {
  expect(() => referenceLimits("individuals", Array(20).fill(1))).toThrow(
    /at least 21/,
  );
  expect(() => referenceLimits("xbar-r", Array(95).fill(1), 5)).toThrow(
    /20 reference subgroups/,
  );
  expect(() => referenceLimits("xbar-r", Array(200).fill(1), 11)).toThrow(
    /between 2 and 10/,
  );
});
