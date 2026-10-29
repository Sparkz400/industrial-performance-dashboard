import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  ruleAt,
  ruleFromSnapshot,
  stabilizedCondition,
} from "../../services/alarmService.js";
import { validateAlarmRule } from "../../services/alarmRuleValidation.js";
it("supports both route vocabularies and measures change using actual source elapsed time", () => {
  const rule = {
    condition: "rate_of_change",
    threshold: 5,
    thresholdHigh: 20,
    rateWindowSeconds: 60,
  };
  expect(evaluateCondition(rule, 20, 2000, { value: 0, sourceTime: 0 })).toBe(
    true,
  );
  expect(evaluateCondition(rule, 20, 10000, { value: 0, sourceTime: 0 })).toBe(
    false,
  );
  expect(
    evaluateCondition(rule, 20, 100000, { value: 0, sourceTime: 0 }),
  ).toBeNull();
  expect(
    evaluateCondition(rule, 20, 10000, { value: null, sourceTime: 0 }),
  ).toBeNull();
  expect(evaluateCondition({ ...rule, condition: "range" }, 21, 0)).toBe(true);
  expect(evaluateCondition({ ...rule, condition: "between" }, 20, 0)).toBe(
    true,
  );
  expect(evaluateCondition({ ...rule, condition: "neq" }, 5, 0)).toBe(false);
});

it("holds noisy transitions, preserves a pending duration and resets on gaps, bad data or rule edits", () => {
  const rule = {
    debounceSeconds: 3,
    clearDebounceSeconds: 2,
    rateWindowSeconds: 2,
    updatedAt: new Date(1000),
  };
  const state = (seconds: number) => ({
    eventId: String(seconds),
    receivedAt: seconds * 1000,
    sourceTime: seconds * 1000,
    value: 12 as number | null,
    lastTriggeredAt: 0,
  });
  const first = state(1);
  expect(stabilizedCondition(rule, true, false, first)).toBe(false);
  const second = state(2);
  expect(
    stabilizedCondition(
      rule,
      true,
      false,
      second,
      JSON.parse(JSON.stringify(first)),
    ),
  ).toBe(false);
  const fourth = state(4);
  expect(stabilizedCondition(rule, true, false, fourth, second)).toBe(true);
  expect(stabilizedCondition(rule, true, false, state(8), fourth)).toBe(false);
  const bad = { ...state(5), value: null };
  expect(stabilizedCondition(rule, null, true, bad, fourth)).toBeNull();
  const good = state(6);
  expect(stabilizedCondition(rule, false, true, good, bad)).toBe(true);
  expect(stabilizedCondition(rule, false, true, state(8), good)).toBe(false);
  expect(
    stabilizedCondition(
      { ...rule, updatedAt: new Date(2000) },
      true,
      false,
      state(4),
      second,
    ),
  ).toBe(false);
  const backwards = state(2);
  expect(stabilizedCondition(rule, false, true, backwards, fourth)).toBeNull();
  expect(backwards.sourceTime).toBe(fourth.sourceTime);
  expect(backwards.value).toBeNull();
});

it("uses recovery margins only for active threshold incidents", () => {
  const rule = {
    condition: "gt",
    threshold: 10,
    thresholdHigh: null,
    rateWindowSeconds: 60,
    hysteresis: 2,
  };
  expect(evaluateCondition(rule, 9, 0)).toBe(false);
  expect(evaluateCondition(rule, 9, 0, undefined, true)).toBe(true);
  expect(evaluateCondition(rule, 8, 0, undefined, true)).toBe(false);
  expect(
    evaluateCondition({ ...rule, condition: "lt" }, 11, 0, undefined, true),
  ).toBe(true);
  expect(
    evaluateCondition({ ...rule, condition: "lt" }, 12, 0, undefined, true),
  ).toBe(false);
  expect(() =>
    validateAlarmRule({
      name: "test",
      nodeKey: "key",
      condition: "eq",
      threshold: 10,
      hysteresis: 2,
    }),
  ).toThrow("Hysteresis");
  expect(() =>
    validateAlarmRule({
      name: "test",
      nodeKey: "key",
      condition: "gt",
      threshold: 10,
      debounceSeconds: -1,
    }),
  ).toThrow("debounce");
});
it("rejects threshold omissions, reversed ranges and undelivered legacy channels", () => {
  expect(() =>
    validateAlarmRule({ name: "test", nodeKey: "key", condition: "gt" }),
  ).toThrow("threshold");
  expect(() =>
    validateAlarmRule({
      name: "test",
      nodeKey: "key",
      condition: "range",
      threshold: 10,
      thresholdHigh: 2,
    }),
  ).toThrow("High threshold");
  expect(() =>
    validateAlarmRule({
      name: "test",
      nodeKey: "key",
      condition: "gt",
      threshold: 10,
      channels: [1],
    }),
  ).toThrow("Legacy channels");
  expect(() =>
    validateAlarmRule({
      name: "test",
      nodeKey: "key",
      condition: "gt",
      threshold: 10,
      channels: [1],
      plantId: 1,
      isActive: false,
    }),
  ).not.toThrow();
});

describe("rule versions during replay", () => {
  const snapshot = (threshold: number, updatedAt: string, isActive = true) =>
    ruleFromSnapshot({
      id: 7,
      name: "Pressure",
      node_key: "Pressure",
      machine_id: 3,
      condition: "gt",
      threshold,
      severity: "high",
      is_active: isActive,
      debounce_seconds: 0,
      clear_debounce_seconds: 0,
      hysteresis: 0,
      created_at: "2026-10-29T08:00:00.000000+00:00",
      updated_at: updatedAt,
    });
  const v1 = snapshot(10, "2026-10-29T08:00:00.000000+00:00");
  const v2 = snapshot(100, "2026-10-29T10:00:00.000000+00:00");
  const versions = [v1, v2].map((rule) => ({
    effectiveAt: rule.updatedAt!.getTime(),
    rule,
  }));
  const at = (iso: string) => Date.parse(iso);

  it("maps trigger snapshots back to rule fields", () => {
    expect(v1).toMatchObject({
      nodeKey: "Pressure",
      machineId: 3,
      threshold: 10,
      isActive: true,
    });
    expect(v2.updatedAt?.toISOString()).toBe("2026-10-29T10:00:00.000Z");
  });

  it("judges samples by the version in force when they were received", () => {
    expect(ruleAt(v2, versions, at("2026-10-29T09:00:00Z"))?.threshold).toBe(
      10,
    );
    expect(ruleAt(v2, versions, at("2026-10-29T10:00:00Z"))?.threshold).toBe(
      100,
    );
    expect(ruleAt(v2, versions, at("2026-10-29T11:00:00Z"))?.threshold).toBe(
      100,
    );
  });

  it("returns no rule when no recorded version covers the receipt time", () => {
    expect(ruleAt(v2, versions, at("2026-10-29T07:00:00Z"))).toBeNull();
    expect(ruleAt(v2, [], at("2026-10-29T09:00:00Z"))).toBeNull();
  });
});
