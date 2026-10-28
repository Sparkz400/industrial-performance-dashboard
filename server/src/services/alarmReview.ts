import type {
  AlarmReview,
  AlarmReplayReview,
} from "@performance-dashboard/shared";
import type { AlertRuleRow } from "../database/schema.js";
import manager from "../database/dbConnection.js";
import { notificationResume } from "./maintenanceActions.js";
import { evaluateCondition, stabilizedCondition } from "./alarmService.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

interface RecordedAlarm {
  id: number;
  rule_id: number | null;
  rule_name: string | null;
  metadata: { healthKey?: string };
  created_at: Date;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
}
interface Delivery {
  alarm_id: number;
  delivered_at: Date | null;
  created_at: Date;
  attempts: number;
  deferred_now: boolean;
}
const percentile = (values: number[], ratio: number) =>
  values.length
    ? values.sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1]
    : null;
export function summarizeAlarms(
  machineId: number,
  start: string,
  end: string,
  alarms: RecordedAlarm[],
  deliveries: Delivery[],
  truncated: boolean,
): AlarmReview {
  const groups = new Map<string, RecordedAlarm[]>();
  for (const a of alarms) {
    const key =
      a.rule_id != null
        ? `rule:${a.rule_id}`
        : a.metadata?.healthKey
          ? `health:${a.metadata.healthKey}`
          : `unidentified:${a.id}`;
    const group = groups.get(key) ?? [];
    group.push(a);
    groups.set(key, group);
  }
  const byAlarm = new Map<number, Delivery[]>();
  for (const d of deliveries) {
    const values = byAlarm.get(d.alarm_id) ?? [];
    values.push(d);
    byAlarm.set(d.alarm_id, values);
  }
  const times = alarms.map((a) => a.created_at.getTime()).sort((a, b) => a - b);
  let peakTenMinuteStarts = 0,
    left = 0;
  for (let right = 0; right < times.length; right++) {
    while (times[right] - times[left] >= 600000) left++;
    peakTenMinuteStarts = Math.max(peakTenMinuteStarts, right - left + 1);
  }
  return {
    machineId,
    start,
    end,
    capturedAt: new Date().toISOString(),
    truncated,
    alarmCount: alarms.length,
    peakTenMinuteStarts,
    rules: [...groups]
      .map(([key, group]) => {
        group.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
        const selected = group.flatMap((a) => byAlarm.get(a.id) ?? []);
        const ack = group
          .filter(
            (a) =>
              a.acknowledged_at &&
              a.acknowledged_at.getTime() >= a.created_at.getTime(),
          )
          .map(
            (a) =>
              (a.acknowledged_at!.getTime() - a.created_at.getTime()) / 1000,
          );
        const delivered = selected.filter(
          (d) =>
            d.delivered_at &&
            d.delivered_at.getTime() >= d.created_at.getTime(),
        );
        const delays = delivered.map(
          (d) => (d.delivered_at!.getTime() - d.created_at.getTime()) / 1000,
        );
        return {
          key,
          ruleId: group[0].rule_id,
          name: group[0].rule_name ?? "Unidentified alarm",
          starts: group.length,
          resolved: group.filter(
            (a) => a.resolved_at && a.resolved_at.getTime() < Date.parse(end),
          ).length,
          openAtEnd: group.filter(
            (a) => !a.resolved_at || a.resolved_at.getTime() >= Date.parse(end),
          ).length,
          repeatsWithinMinute: group.filter(
            (a, i) =>
              i > 0 &&
              a.created_at.getTime() - group[i - 1].created_at.getTime() <
                60000,
          ).length,
          acknowledged: ack.length,
          acknowledgementP50Seconds: percentile(ack, 0.5),
          acknowledgementP95Seconds: percentile(ack, 0.95),
          deliveryCount: selected.length,
          delivered: delivered.length,
          failedPending: selected.filter(
            (d) => !d.delivered_at && d.attempts > 0,
          ).length,
          deferredNow: selected.filter((d) => !d.delivered_at && d.deferred_now)
            .length,
          deliveryP50Seconds: percentile(delays, 0.5),
          deliveryP95Seconds: percentile(delays, 0.95),
        };
      })
      .sort((a, b) => b.starts - a.starts || a.key.localeCompare(b.key)),
  };
}
export function validateReviewWindow(
  start: string,
  end: string,
  maxHours = 168,
) {
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > maxHours * 3600000
  )
    throw new ValidationError(
      `Choose a positive window of at most ${maxHours} hours`,
    );
}
export async function alarmReview(
  machineId: number,
  start: string,
  end: string,
) {
  validateReviewWindow(start, end);
  const alarms = (
    await manager.pool.query<RecordedAlarm>(
      "SELECT id,rule_id,rule_name,metadata,created_at,acknowledged_at,resolved_at FROM alert_history WHERE machine_id=$1 AND created_at >= $2 AND created_at < $3 ORDER BY created_at,id LIMIT 10001",
      [machineId, start, end],
    )
  ).rows;
  const ids = alarms.slice(0, 10000).map((a) => a.id);
  const deliveries = (
    await manager.pool.query(
      `SELECT (d.event->'payload'->>'id')::int AS alarm_id,d.created_at,d.delivered_at,d.attempts FROM webhook_deliveries d WHERE d.event->>'type'='alarm.triggered' AND d.event->'payload'->>'id'=ANY($1::text[]) ORDER BY d.id LIMIT 50001`,
      [ids.map(String)],
    )
  ).rows;
  const actions = (
    await manager.pool.query(
      `SELECT a.alarm_id,h.rule_id,h.metadata,a.suppression_until,a.quiet_start,a.quiet_end FROM maintenance_actions a JOIN alert_history h ON h.id=a.alarm_id WHERE a.machine_id=$1 AND a.completed_at IS NULL LIMIT 10001`,
      [machineId],
    )
  ).rows;
  const deferredKeys = new Set<string>(),
    now = new Date();
  for (const a of actions.slice(0, 10000))
    if (
      notificationResume(
        now,
        a.suppression_until,
        a.quiet_start,
        a.quiet_end,
      ) != null
    ) {
      deferredKeys.add(`alarm:${a.alarm_id}`);
      if (a.rule_id != null) deferredKeys.add(`rule:${a.rule_id}`);
      else if (a.metadata?.healthKey)
        deferredKeys.add(`health:${a.metadata.healthKey}`);
    }
  const deferred = new Set(
    alarms
      .filter(
        (a) =>
          deferredKeys.has(`alarm:${a.id}`) ||
          (a.rule_id != null && deferredKeys.has(`rule:${a.rule_id}`)) ||
          (a.rule_id == null &&
            a.metadata?.healthKey &&
            deferredKeys.has(`health:${a.metadata.healthKey}`)),
      )
      .map((a) => a.id),
  );
  return summarizeAlarms(
    machineId,
    start,
    end,
    alarms.slice(0, 10000),
    deliveries
      .slice(0, 50000)
      .map((d) => ({ ...d, deferred_now: deferred.has(d.alarm_id) })),
    alarms.length > 10000 ||
      deliveries.length > 50000 ||
      actions.length > 10000,
  );
}
interface ReplayReading {
  id: number;
  timestamp: Date;
  source_timestamp: Date | null;
  received_at: Date | null;
  value: number | null;
  status_code: string | null;
  signal_metadata: { signalId?: string; mappingRevision?: string } | null;
}
export function evaluateRecordedAlarm(
  rule: AlertRuleRow,
  rows: ReplayReading[],
  start: string,
  end: string,
  proposal: AlarmReplayReview["proposals"],
  actualStarts: number,
  truncated: boolean,
): AlarmReplayReview {
  const candidate = { ...rule, ...proposal },
    transitions: AlarmReplayReview["transitions"] = [];
  let previous: Parameters<typeof stabilizedCondition>[4],
    active = false,
    known = false,
    starts = 0,
    clears = 0,
    unusable = 0,
    missingClocks = 0,
    gaps = 0,
    missingIdentity = 0,
    identityChanges = 0,
    identity: string | null = null,
    lastTriggeredAt = 0;
  for (const row of rows) {
    const currentIdentity =
      row.signal_metadata?.signalId && row.signal_metadata?.mappingRevision
        ? `${row.signal_metadata.signalId}:${row.signal_metadata.mappingRevision}`
        : null;
    if (!currentIdentity) {
      missingIdentity++;
      previous = undefined;
      known = false;
      active = false;
      continue;
    }
    if (identity && identity !== currentIdentity) {
      identityChanges++;
      previous = undefined;
      known = false;
      active = false;
    }
    identity = currentIdentity;
    if (!row.source_timestamp || !row.received_at) {
      missingClocks++;
      previous = undefined;
      known = false;
      active = false;
      continue;
    }
    const sourceTime = row.source_timestamp.getTime(),
      receivedAt = row.received_at.getTime();
    const value =
      row.status_code?.startsWith("Good") &&
      row.value != null &&
      Number.isFinite(row.value)
        ? row.value
        : null;
    const gap =
      previous &&
      (sourceTime < previous.sourceTime ||
        receivedAt < previous.receivedAt ||
        sourceTime - previous.sourceTime >
          (rule.rateWindowSeconds ?? 60) * 1000 ||
        receivedAt - previous.receivedAt >
          (rule.rateWindowSeconds ?? 60) * 1000);
    if (gap) {
      gaps++;
      known = false;
      active = false;
      previous = undefined;
    }
    const state = {
      eventId: String(row.id),
      receivedAt,
      sourceTime,
      value,
      lastTriggeredAt,
    };
    if (value == null) {
      unusable++;
      known = false;
      active = false;
      previous = { ...state, value: null };
      continue;
    }
    const condition = evaluateCondition(
      candidate,
      value,
      sourceTime,
      previous,
      active,
    );
    const stable = stabilizedCondition(
      candidate,
      condition,
      active,
      state,
      previous,
    );
    if (!known) {
      active = false;
      known = condition === false;
      previous = state;
      continue;
    }
    if (stable === false && active) {
      active = false;
      clears++;
      if (transitions.length < 500)
        transitions.push({
          at: row.received_at.toISOString(),
          condition: "clear",
        });
    }
    if (
      stable === true &&
      !active &&
      receivedAt - state.lastTriggeredAt >=
        (candidate.cooldownSeconds ?? 300) * 1000
    ) {
      active = true;
      starts++;
      state.lastTriggeredAt = receivedAt;
      lastTriggeredAt = receivedAt;
      if (transitions.length < 500)
        transitions.push({
          at: row.received_at.toISOString(),
          condition: "active",
        });
    }
    previous = state;
  }
  return {
    machineId: rule.machineId!,
    ruleId: rule.id,
    ruleUpdatedAt: rule.updatedAt?.toISOString() ?? null,
    start,
    end,
    samples: rows.length,
    unusable,
    missingClocks,
    missingIdentity,
    identityChanges,
    gaps,
    truncated,
    initialCondition: "unknown",
    actualStarts,
    proposedStarts: starts,
    proposedClears: clears,
    proposals: proposal,
    transitions,
    transitionsTruncated: starts + clears > 500,
  };
}
export async function replayAlarmReview(
  machineId: number,
  ruleId: number,
  start: string,
  end: string,
  proposal: AlarmReplayReview["proposals"],
) {
  validateReviewWindow(start, end, 48);
  const raw = (
    await manager.pool.query(
      "SELECT * FROM alert_rules WHERE id=$1 AND machine_id=$2",
      [ruleId, machineId],
    )
  ).rows[0];
  if (!raw) throw new NotFoundError("Rule for this machine");
  const rule = {
    ...raw,
    machineId: raw.machine_id,
    thresholdHigh: raw.threshold_high,
    rateWindowSeconds: raw.rate_window_seconds,
    cooldownSeconds: raw.cooldown_seconds,
    debounceSeconds: raw.debounce_seconds,
    clearDebounceSeconds: raw.clear_debounce_seconds,
    updatedAt: raw.updated_at,
  } as AlertRuleRow;
  if (
    proposal.hysteresis > 0 &&
    !["gt", "gte", "lt", "lte"].includes(rule.condition)
  )
    throw new ValidationError(
      "Hysteresis applies only to greater/less-than rules",
    );
  const rows = (
    await manager.pool.query<ReplayReading>(
      "SELECT id,timestamp,source_timestamp,received_at,value,status_code,signal_metadata FROM opcua_data WHERE machine_id=$1 AND node_key=$2 AND timestamp >= $3 AND timestamp < $4 ORDER BY received_at NULLS FIRST,id LIMIT 10001",
      [machineId, raw.node_key, start, end],
    )
  ).rows;
  const actual = Number(
    (
      await manager.pool.query(
        "SELECT count(*) FROM alert_history WHERE machine_id=$1 AND rule_id=$2 AND created_at >= $3 AND created_at < $4",
        [machineId, ruleId, start, end],
      )
    ).rows[0].count,
  );
  return evaluateRecordedAlarm(
    rule,
    rows.slice(0, 10000),
    start,
    end,
    proposal,
    actual,
    rows.length > 10000,
  );
}
