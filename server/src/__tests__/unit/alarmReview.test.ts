import { it, expect } from "vitest";
import type { AlertRuleRow } from "../../database/schema.js";
import {
  summarizeAlarms,
  evaluateRecordedAlarm,
  validateReviewWindow,
} from "../../services/alarmReview.js";
const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1) + seconds * 1000);
it("separates acknowledgement, queued delivery and repeats without inventing unseen alarm identities", () => {
  const alarms = [0, 30, 80].map((seconds, i) => ({
    id: i + 1,
    rule_id: 1,
    rule_name: "Pressure",
    metadata: {},
    created_at: at(seconds),
    acknowledged_at: i < 2 ? at(seconds + 10 + i * 10) : null,
    resolved_at: i < 2 ? at(seconds + 5) : null,
  }));
  const review = summarizeAlarms(
    1,
    at(0).toISOString(),
    at(100).toISOString(),
    alarms,
    [
      {
        alarm_id: 1,
        created_at: at(2),
        delivered_at: at(7),
        attempts: 1,
        deferred_now: false,
      },
      {
        alarm_id: 2,
        created_at: at(32),
        delivered_at: null,
        attempts: 2,
        deferred_now: true,
      },
    ],
    false,
  );
  expect(review.peakTenMinuteStarts).toBe(3);
  expect(review.rules[0]).toMatchObject({
    starts: 3,
    resolved: 2,
    openAtEnd: 1,
    repeatsWithinMinute: 2,
    acknowledged: 2,
    acknowledgementP50Seconds: 10,
    acknowledgementP95Seconds: 20,
    deliveryCount: 2,
    delivered: 1,
    failedPending: 1,
    deferredNow: 1,
    deliveryP50Seconds: 5,
  });
  const empty = summarizeAlarms(
    1,
    at(0).toISOString(),
    at(100).toISOString(),
    [{ ...alarms[0], acknowledged_at: null }],
    [],
    false,
  );
  expect(empty.rules[0].deliveryP50Seconds).toBeNull();
  expect(empty.rules[0].acknowledgementP50Seconds).toBeNull();
  const missing = alarms.map((a) => ({ ...a, rule_id: null }));
  expect(summarizeAlarms(1, "", "", missing, [], false).rules).toHaveLength(3);
});
const rule = {
  id: 1,
  machineId: 1,
  nodeKey: "Pressure",
  condition: "gt",
  threshold: 10,
  thresholdHigh: null,
  cooldownSeconds: 0,
  debounceSeconds: 0,
  clearDebounceSeconds: 0,
  hysteresis: 0,
  rateWindowSeconds: 5,
  updatedAt: at(0),
} as AlertRuleRow;
const proposal = { debounceSeconds: 0, clearDebounceSeconds: 0, hysteresis: 0 };
const readings = (values: (number | null)[]) =>
  values.map((value, i) => ({
    id: i,
    timestamp: at(i),
    source_timestamp: at(i),
    received_at: at(i),
    value,
    status_code: value == null ? "Bad" : "Good",
    signal_metadata: { signalId: "same", mappingRevision: "one" },
  }));
it("previews retained measurements without transitions across unknown initial state, gaps or bad quality", () => {
  const result = evaluateRecordedAlarm(
    rule,
    readings([20, 20, 0, 20, 20, 0, null, 20, 0, 20]),
    at(0).toISOString(),
    at(10).toISOString(),
    proposal,
    9,
    false,
  );
  expect(result.proposedStarts).toBe(2);
  expect(result.proposedClears).toBe(1);
  expect(result.unusable).toBe(1);
  expect(result.initialCondition).toBe("unknown");
  expect(result.actualStarts).toBe(9);
  const missing = readings([0, 20]);
  missing[1].received_at = null as unknown as Date;
  expect(
    evaluateRecordedAlarm(rule, missing, "", "", proposal, 0, false)
      .missingClocks,
  ).toBe(1);
  const changed = readings([0, 20]);
  changed[1].signal_metadata.mappingRevision = "two";
  expect(
    evaluateRecordedAlarm(rule, changed, "", "", proposal, 0, false),
  ).toMatchObject({ identityChanges: 1, proposedStarts: 0 });
  const gap = readings([0, 20]);
  gap[1].received_at = at(100);
  gap[1].source_timestamp = at(100);
  expect(
    evaluateRecordedAlarm(rule, gap, "", "", proposal, 0, false),
  ).toMatchObject({ gaps: 1, proposedStarts: 0 });
});
it("uses the production debounce and hysteresis rules while keeping proposal edits isolated", () => {
  const rows = readings([0, 20, 0, 20, 20, 20, 20, 0]);
  const plain = evaluateRecordedAlarm(rule, rows, "", "", proposal, 0, false);
  const held = evaluateRecordedAlarm(
    rule,
    rows,
    "",
    "",
    { ...proposal, debounceSeconds: 2 },
    0,
    false,
  );
  expect(plain.proposedStarts).toBe(2);
  expect(held.proposedStarts).toBe(1);
  expect(rule.debounceSeconds).toBe(0);
  expect(() => validateReviewWindow("2026-01-01", "2026-01-10")).toThrow("168");
  expect(() => validateReviewWindow("2026-01-02", "2026-01-01")).toThrow(
    "positive",
  );
});

it("does not reset cooldown or infer transitions after identity, quality, or time gaps", () => {
  const rows = readings([0, 20, null, 0, 20]);
  expect(
    evaluateRecordedAlarm(
      { ...rule, cooldownSeconds: 10 },
      rows,
      "",
      "",
      proposal,
      0,
      false,
    ),
  ).toMatchObject({ proposedStarts: 1, proposedClears: 0 });
  const unknown = readings([0, 20]);
  unknown[1].signal_metadata =
    null as unknown as (typeof unknown)[1]["signal_metadata"];
  expect(
    evaluateRecordedAlarm(rule, unknown, "", "", proposal, 0, false),
  ).toMatchObject({ missingIdentity: 1, proposedStarts: 0 });
  expect(
    evaluateRecordedAlarm(rule, [], "", "", proposal, 0, false),
  ).toMatchObject({
    samples: 0,
    initialCondition: "unknown",
    proposedStarts: 0,
  });
});
