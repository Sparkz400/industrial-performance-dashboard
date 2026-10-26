import { it, expect } from "vitest";
import { evaluateCondition } from "../../services/alarmService.js";
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
