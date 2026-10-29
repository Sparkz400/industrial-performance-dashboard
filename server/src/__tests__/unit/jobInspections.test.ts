import { expect, it } from "vitest";
import { summarizeInspections } from "../../services/jobInspections.js";

const record = (
  id: number,
  result: string,
  quantity: number,
  extra: Partial<{
    reinspectsId: number;
    supersedesId: number;
    checkName: string;
  }> = {},
) => ({
  id,
  product: "Bracket",
  checkName: "Burr",
  result,
  quantity,
  reinspectsId: null,
  supersedesId: null,
  ...extra,
});

it("counts a reworked part once and applies only current corrections", () => {
  const summary = summarizeInspections(
    [
      record(1, "pass", 40),
      record(2, "fail", 10),
      record(3, "pass", 6, { reinspectsId: 2 }), // six of the ten failed parts are reworked
      record(4, "fail", 2, { reinspectsId: 2 }), // a failed reinspection leaves them failed
      record(5, "fail", 5),
      record(6, "pass", 5, { supersedesId: 5 }), // correction: those five actually passed
      record(7, "unknown", 3, { checkName: "Thread" }),
    ],
    [{ product: "Bracket", checks: ["Burr", "Thread", "Length"] }],
  );
  expect(summary.checks).toEqual([
    {
      product: "Bracket",
      check: "Burr",
      inspected: 55,
      passed: 45,
      failed: 4,
      reworked: 6,
      unknown: 0,
    },
    {
      product: "Bracket",
      check: "Thread",
      inspected: 3,
      passed: 0,
      failed: 0,
      reworked: 0,
      unknown: 3,
    },
  ]);
  expect(summary.missing).toEqual([{ product: "Bracket", check: "Length" }]);
});
