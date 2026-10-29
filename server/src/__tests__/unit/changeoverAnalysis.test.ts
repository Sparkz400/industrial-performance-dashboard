import { expect, it } from "vitest";
import type {
  DowntimeReason,
  ProductionInterval,
  ProductRun,
} from "@performance-dashboard/shared";
import {
  measureChangeovers,
  type ObservedShift,
} from "../../services/changeoverAnalysis.js";

// Minutes after 06:00 UTC; run boundaries use an offset form on purpose.
const at = (minute: number) =>
  new Date(Date.UTC(2026, 0, 5, 6, minute)).toISOString();
const run = (product: string, from: number, to: number): ProductRun => ({
  start: at(from).replace("Z", "+00:00"),
  end: at(to).replace("Z", "+00:00"),
  reference: `job-${product}-${from}`,
  product,
  target: null,
  idealCycleMs: 1000,
});
const state = (
  from: number,
  to: number,
  s: ProductionInterval["state"],
): ProductionInterval => ({ start: at(from), end: at(to), state: s });
const reason = (
  id: number,
  from: number,
  to: number,
  category: DowntimeReason["category"],
  supersedesId: number | null = null,
): DowntimeReason => ({
  id,
  start: at(from),
  end: at(to),
  category,
  reason: "fixture",
  actorId: 1,
  createdAt: at(0),
  supersedesId,
});
const shift = (patch: Partial<ObservedShift>): ObservedShift => ({
  id: 1,
  name: "Early",
  runs: [],
  breaks: [],
  intervals: [],
  reasons: [],
  ...patch,
});

it("measures from the last running of a run to the first of the next, minus breaks", () => {
  const { transitions, groups } = measureChangeovers(
    [
      shift({
        runs: [run("A", 0, 60), run("B", 90, 180)],
        // A stops 5 minutes early; a trial run before B's planned start stays part of the
        // changeover, which ends when B first runs.
        intervals: [
          state(0, 55, "running"),
          state(55, 70, "idle"),
          state(70, 75, "running"),
          state(75, 95, "idle"),
          state(95, 180, "running"),
        ],
        breaks: [{ start: at(60), end: at(65) }],
        reasons: [
          reason(1, 55, 70, "unplanned"),
          reason(2, 55, 70, "changeover", 1),
          reason(3, 75, 80, "changeover"),
        ],
      }),
    ],
    [
      { id: 1, fromProduct: "A", toProduct: "B", expectedSeconds: 600 },
      { id: 2, fromProduct: "A", toProduct: "B", expectedSeconds: 900 },
    ],
  );
  expect(transitions).toHaveLength(1);
  expect(transitions[0]).toMatchObject({
    status: "observed",
    stoppedAt: at(55),
    resumedAt: at(95),
    breakSeconds: 300,
    actualSeconds: 40 * 60 - 300,
    // The superseded unplanned reason does not count; its correction counts outside the break.
    confirmedSeconds: 10 * 60 + 5 * 60,
    expectedSeconds: 900,
  });
  expect(groups).toEqual([
    {
      fromProduct: "A",
      toProduct: "B",
      transitions: 1,
      observed: 1,
      medianActualSeconds: 2100,
      expectedSeconds: 900,
      standardId: 2,
      medianDifferenceSeconds: 1200,
    },
  ]);
});

it("keeps unobserved and cross-shift transitions visible without measuring them", () => {
  const { transitions, groups } = measureChangeovers(
    [
      shift({
        runs: [
          run("A", 0, 60),
          run("B", 60, 120),
          run("B", 120, 150),
          run("A", 150, 240),
        ],
        intervals: [
          state(0, 50, "running"),
          state(50, 70, "unknown"),
          state(70, 140, "running"),
          state(140, 240, "idle"),
        ],
      }),
      shift({
        id: 2,
        name: "Late",
        runs: [run("C", 480, 600)],
      }),
    ],
    [],
  );
  expect(
    transitions.map((t) => [t.from.product, t.to.product, t.status, t.issue]),
  ).toEqual([
    ["A", "B", "unobserved", "Machine state unknown during the changeover"],
    ["B", "A", "unobserved", "No running observed in the later run"],
    ["A", "C", "across-shifts", "Spans two shifts; not measured"],
  ]);
  expect(transitions[0].actualSeconds).toBeNull();
  expect(
    groups.map((g) => [
      g.fromProduct,
      g.toProduct,
      g.observed,
      g.medianActualSeconds,
    ]),
  ).toEqual([
    ["A", "B", 0, null],
    ["A", "C", 0, null],
    ["B", "A", 0, null],
  ]);
});

it("reports zero when running continues across the product boundary", () => {
  const { transitions } = measureChangeovers(
    [
      shift({
        runs: [run("A", 0, 60), run("B", 60, 120)],
        intervals: [state(0, 120, "running")],
      }),
    ],
    [],
  );
  expect(transitions[0]).toMatchObject({
    status: "observed",
    actualSeconds: 0,
  });
});
