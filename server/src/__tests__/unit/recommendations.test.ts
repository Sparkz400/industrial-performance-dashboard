import { expect, it } from "vitest";
import { recommend } from "../../services/recommendations.js";
import type { ComparisonSnapshot } from "../../services/periodComparison.js";

const revision = (
  id: number,
  losses: { reason: string; seconds: number }[],
  verified = true,
) => ({
  revisionId: id,
  snapshot: {
    start: new Date(Date.UTC(2026, 4, id, 6)).toISOString(),
    verified,
    losses,
  } as unknown as ComparisonSnapshot,
});

it("asks to classify stops when unclassified time dominates, ignoring breaks, unknown data and unverified reports", () => {
  const rows = [
    revision(1, [
      { reason: "Unclassified stop", seconds: 900 },
      { reason: "Jam", seconds: 1800 },
    ]),
    revision(2, [
      { reason: "Unclassified stop", seconds: 100 },
      { reason: "Planned break", seconds: 9000 },
      { reason: "Unknown data", seconds: 9000 },
    ]),
    revision(3, [{ reason: "Unclassified stop", seconds: 99999 }], false),
  ];
  const [first] = recommend({
    revisions: rows,
    maintenance: [],
    improvements: [],
  });
  expect(first).toMatchObject({
    rule: "classify-stops",
    key: "classify-stops:2",
    evidence: {
      revisionIds: [1, 2],
      unclassifiedSeconds: 1000,
      stopSeconds: 2800,
    },
  });
  expect(
    recommend({
      revisions: [
        revision(1, [
          { reason: "Unclassified stop", seconds: 100 },
          { reason: "Jam", seconds: 900 },
        ]),
      ],
      maintenance: [],
      improvements: [],
    }),
  ).toEqual([]);
});

it("escalates a recurring alarm and asks for an action on a repeated top loss until one exists", () => {
  const rows = [1, 2, 3, 4].map((id) =>
    revision(id, [
      { reason: id === 2 ? "Material" : "Belt jam", seconds: 3000 },
      { reason: "Material", seconds: 1000 },
    ]),
  );
  const maintenance = [
    {
      id: 7,
      outcome: "recurred",
      rule_name: "Pressure high",
      repeated_alarms: 2,
    },
    {
      id: 8,
      outcome: "recovered-observed",
      rule_name: "Temperature",
      repeated_alarms: 0,
    },
  ];
  const found = recommend({ revisions: rows, maintenance, improvements: [] });
  expect(found.map((r) => r.key)).toEqual([
    "escalate-recurrence:7",
    "address-top-loss:Belt jam:1",
  ]);
  expect(found[1].evidence.revisionIds).toEqual([1, 3, 4]);
  const after = recommend({
    revisions: rows,
    maintenance: [],
    improvements: [{ id: 3, implementedAt: new Date(Date.UTC(2026, 4, 2)) }],
  });
  expect(after).toEqual([]);
});
