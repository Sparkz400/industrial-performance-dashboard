import { describe, expect, it, vi } from "vitest";
vi.mock("../../database/db.js", () => ({ default: {} }));
import { liveCount, liveState } from "../../services/liveProductionService.js";
import type { ProductionProfile } from "@performance-dashboard/shared";

const now = new Date("2026-10-26T12:00:00Z");
const profile: ProductionProfile = {
  version: 1,
  name: "Owned",
  endpointModel: "Owned",
  signals: {
    state: {
      nodeKey: "state",
      namespaceUri: "urn:owned",
      identifier: "s=state",
      dataType: "Int32",
      unit: null,
      scale: 1,
    },
  },
  states: { running: [1], idle: [0], fault: [2], planned: [3] },
  maxGapSeconds: 20,
  idealCycleMs: 1000,
  counterPolicy: "reject-decrease",
};
const sample = {
  timestamp: now,
  sourceTimestamp: now,
  receivedAt: now,
  value: 1,
  statusCode: "Good",
};
describe("live machine freshness", () => {
  it("requires connection, identity-matched data, receive time and good quality", () => {
    expect(liveState("connected", sample, profile, now)).toEqual({
      state: "running",
      freshness: "fresh",
    });
    expect(liveState("disconnected", sample, profile, now)).toEqual({
      state: "unknown",
      freshness: "disconnected",
    });
    expect(liveState("connected", undefined, profile, now).freshness).toBe(
      "missing",
    );
    expect(
      liveState("connected", { ...sample, receivedAt: null }, profile, now)
        .state,
    ).toBe("unknown");
    for (const value of [
      { ...sample, value: null },
      { ...sample, statusCode: "Uncertain" },
      { ...sample, value: 99 },
    ])
      expect(liveState("connected", value, profile, now)).toEqual({
        state: "unknown",
        freshness: "bad-quality",
      });
  });
  it("does not call delayed replay or future-dated values live", () => {
    expect(
      liveState(
        "connected",
        { ...sample, sourceTimestamp: new Date(now.getTime() - 20001) },
        profile,
        now,
      ).freshness,
    ).toBe("stale");
    expect(
      liveState(
        "connected",
        { ...sample, receivedAt: new Date(now.getTime() - 20001) },
        profile,
        now,
      ).freshness,
    ).toBe("stale");
    expect(
      liveState(
        "connected",
        { ...sample, sourceTimestamp: new Date(now.getTime() + 2001) },
        profile,
        now,
      ).freshness,
    ).toBe("clock-skew");
    expect(
      liveState(
        "connected",
        { ...sample, sourceTimestamp: new Date(now.getTime() - 20000) },
        profile,
        now,
      ).freshness,
    ).toBe("fresh");
  });
});
describe("live shift count", () => {
  const start = new Date(now.getTime() - 30000);
  const at = (s: number, value: number) => ({
    timestamp: new Date(start.getTime() + s * 1000),
    value,
    statusCode: "Good",
  });
  it("is complete through a fresh last sample, never through an unsampled now", () => {
    expect(
      liveCount([at(0, 10), at(10, 15), at(20, 18)], profile, 1, start, now),
    ).toEqual({
      observed: 8,
      complete: true,
      asOf: at(20, 0).timestamp.toISOString(),
      truncated: false,
    });
    // Last sample 21 s old with a 20 s gap limit: counted, but not complete.
    const stale = new Date(now.getTime() + 11000);
    expect(
      liveCount([at(0, 10), at(10, 15), at(20, 18)], profile, 1, start, stale),
    ).toMatchObject({ observed: 8, complete: false });
    // No sample at the shift start: incomplete.
    expect(
      liveCount([at(5, 10), at(20, 18)], profile, 1, start, now).complete,
    ).toBe(false);
  });
});
