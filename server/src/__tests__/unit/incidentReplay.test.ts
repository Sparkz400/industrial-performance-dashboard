import { describe, it, expect } from "vitest";
import {
  replayObservation,
  replayPoints,
  type ReplaySample,
} from "@performance-dashboard/shared";

const at = (second: number) =>
  new Date(Date.UTC(2026, 1, 1, 12, 0, second)).toISOString();
const sample = (
  second: number,
  value: number | string | boolean | null,
  quality = "Good",
): ReplaySample => ({
  id: second,
  at: at(second),
  sourceAt: null,
  receivedAt: at(second + 10),
  value: typeof value === "number" ? value : null,
  raw: value,
  rawTruncated: false,
  quality,
  identity: null,
});

describe("incident replay observations", () => {
  it("keeps missing, bad and old observations unknown without interpolation", () => {
    const rows = [
      sample(1, 10),
      sample(2, 999, "BadNoCommunication"),
      sample(20, 20),
    ];
    expect(replayObservation(rows, Date.parse(at(0)), 5).known).toBe(false);
    expect(replayObservation(rows, Date.parse(at(1)), 5).sample?.raw).toBe(10);
    expect(replayObservation(rows, Date.parse(at(2)), 5).known).toBe(false);
    expect(replayObservation(rows, Date.parse(at(15)), 5).reason).toBe(
      "Observation gap",
    );
    expect(replayObservation(rows, Date.parse(at(20)), 5).known).toBe(true);
    expect(
      replayPoints(rows, at(0), at(30), 5).map((point) => point.y),
    ).toEqual([null, 10, null, null, 20, null]);
  });
  it("preserves false, zero and strings; same-time last row wins consistently", () => {
    for (const value of [false, 0, "Ready"])
      expect(
        replayObservation([sample(1, value)], Date.parse(at(1)), 5).known,
      ).toBe(true);
    const rows = [sample(1, 1), sample(1, 2)];
    expect(replayObservation(rows, Date.parse(at(1)), 5).sample?.value).toBe(2);
    expect(replayPoints(rows, at(0), at(2), 5)).toEqual([
      { x: at(0), y: null },
      { x: at(1), y: 2 },
      { x: at(2), y: null },
    ]);
  });
  it("breaks chart lines across mapping changes even with good nearby samples", () => {
    const identity = {
      signalId: "fixture",
      endpointUrl: "opc.tcp://localhost:4842",
      machineId: 1,
      nodeId: "ns=2;s=Count",
      namespaceUri: "urn:fixture",
      identifier: "s=Count",
      mappingRevision: "one",
      unit: "parts",
    };
    const rows = [
      { ...sample(1, 1), identity },
      { ...sample(3, 3), identity: { ...identity, mappingRevision: "two" } },
    ];
    expect(replayPoints(rows, at(0), at(4), 5)).toContainEqual({
      x: at(2),
      y: null,
    });
  });
});
