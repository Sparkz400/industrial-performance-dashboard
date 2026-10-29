import { expect, it } from "vitest";
import { changedSections } from "../../services/reportRevisionCheck.js";

const report = {
  id: 1,
  generatedAt: "2026-10-29T10:00:00.000Z",
  quantities: { total: 15, good: 13, reject: 2 },
  oee: { overall: 0.43 },
  runs: [
    {
      report: {
        generatedAt: "2026-10-29T10:00:00.000Z",
        oee: { overall: 0.4 },
      },
    },
  ],
};

it("ignores generation times and key order", () => {
  const regenerated = {
    oee: { overall: 0.43 },
    runs: [
      {
        report: {
          oee: { overall: 0.4 },
          generatedAt: "2026-10-30T08:00:00.000Z",
        },
      },
    ],
    quantities: { reject: 2, good: 13, total: 15 },
    generatedAt: "2026-10-30T08:00:00.000Z",
    id: 1,
  };
  expect(changedSections(report, regenerated)).toEqual([]);
});

it("names each changed, added or removed section", () => {
  expect(
    changedSections(report, {
      ...report,
      quantities: { total: 15, good: 12, reject: 3 },
      energy: { kWh: 3 },
      runs: undefined,
    }),
  ).toEqual(["energy", "quantities", "runs"]);
});
