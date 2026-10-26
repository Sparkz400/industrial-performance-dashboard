import { expect, it, vi } from "vitest";
vi.mock("../../database/dbConnection.js", () => ({ default: {} }));
import { baselineStatistics, capability } from "../../services/spcBaseline.js";
it("matches the NIST capability example USL=20 LSL=8 mean=16 s=2", () => {
  const result = capability(16, 2, 8, 20);
  expect(result.cp).toBe(1);
  expect(result.cpk).toBeCloseTo(2 / 3, 12);
});
it("uses sample standard deviation and detects a sustained shift", () => {
  expect(baselineStatistics([2, 4, 4, 4, 5, 5, 7, 9]).stddev).toBeCloseTo(
    Math.sqrt(32 / 7),
    12,
  );
  expect(
    baselineStatistics([...Array(100).fill(0), ...Array(20).fill(10)])
      .violations.length,
  ).toBeGreaterThan(0);
  expect(() => capability(0, 0, -1, 1)).toThrow();
  expect(() => baselineStatistics([1, NaN])).toThrow();
});
