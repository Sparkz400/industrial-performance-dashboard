import { expect, it } from "vitest";
import type { ProductionInterval } from "@performance-dashboard/shared";
import { reliabilityFromIntervals } from "../../services/reliability.js";

const at = (minute: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
const run = (...parts: [number, number, ProductionInterval["state"]][]) =>
  parts.map(([from, to, state]) => ({ start: at(from), end: at(to), state }));

it("counts each observed fault start once and averages running and repair time", () => {
  const result = reliabilityFromIntervals(
    run(
      [0, 50, "running"],
      [50, 60, "fault"],
      [60, 100, "running"],
      [100, 104, "fault"],
      [104, 120, "idle"],
    ),
  );
  expect(result).toMatchObject({ failures: 2, complete: true });
  expect(result.mtbfSeconds).toBe((90 * 60) / 2);
  expect(result.mttrSeconds).toBe((14 * 60) / 2);
});

it("does not invent a failure whose start was not observed", () => {
  // Fault at the window start, and fault right after unknown data.
  const result = reliabilityFromIntervals(
    run(
      [0, 10, "fault"],
      [10, 40, "running"],
      [40, 50, "unknown"],
      [50, 55, "fault"],
      [55, 60, "running"],
    ),
  );
  expect(result.failures).toBe(0);
  expect(result.mtbfSeconds).toBeNull();
  expect(result.mttrSeconds).toBeNull();
  expect(result.complete).toBe(false);
  expect(result.faultSeconds).toBe(15 * 60);
});

it("reports no failures as unknown MTBF, not infinite", () => {
  expect(
    reliabilityFromIntervals(run([0, 60, "running"])).mtbfSeconds,
  ).toBeNull();
});
