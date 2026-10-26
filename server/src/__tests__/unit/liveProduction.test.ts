import { describe, expect, it, vi } from "vitest";
vi.mock("../../database/db.js", () => ({ default: {} }));
import { liveState } from "../../services/liveProductionService.js";
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
