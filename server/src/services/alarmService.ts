import { EventEmitter } from "node:events";
import { and, asc, eq, inArray, isNull, desc, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  alertHistory,
  alertRuleVersions,
  alarmEvaluationState,
  alarmEvaluationReceipts,
  webhooks,
  webhookDeliveries,
  type AlertRuleRow,
  type AlertHistoryRow,
} from "../database/schema.js";
import { alarmRepository } from "../repositories/alarmRepository.js";
import type { SpoolEntry } from "../queue/measurementSpool.js";
import type { AlarmEvent } from "@performance-dashboard/shared";
import logger from "../utils/logger.js";
import { routesAlarm } from "./alarmRouting.js";

export interface RuleVersion {
  effectiveAt: number;
  rule: AlertRuleRow;
}

/** Trigger snapshots use column names; map them back to the rule shape the evaluator uses. */
export function ruleFromSnapshot(s: Record<string, unknown>): AlertRuleRow {
  const date = (v: unknown) => (v == null ? null : new Date(String(v)));
  return {
    id: s.id as number,
    name: s.name as string,
    description: (s.description ?? null) as string | null,
    machineId: (s.machine_id ?? null) as number | null,
    plantId: (s.plant_id ?? null) as number | null,
    nodeKey: s.node_key as string,
    condition: s.condition as string,
    threshold: (s.threshold ?? null) as number | null,
    thresholdHigh: (s.threshold_high ?? null) as number | null,
    rateWindowSeconds: (s.rate_window_seconds ?? null) as number | null,
    severity: s.severity as AlertRuleRow["severity"],
    channels: s.channels ?? [],
    cooldownSeconds: (s.cooldown_seconds ?? null) as number | null,
    debounceSeconds: (s.debounce_seconds ?? 0) as number,
    clearDebounceSeconds: (s.clear_debounce_seconds ?? 0) as number,
    hysteresis: (s.hysteresis ?? 0) as number,
    isActive: (s.is_active ?? null) as boolean | null,
    createdBy: (s.created_by ?? null) as number | null,
    createdAt: date(s.created_at),
    updatedAt: date(s.updated_at),
  };
}

/**
 * A sample is judged by the rule version in force when it was received, so replay after an
 * outage cannot apply thresholds that did not exist yet. Null: no recorded version covers it.
 */
export function ruleAt(
  rule: AlertRuleRow,
  versions: RuleVersion[] | undefined,
  receivedAt: number,
): AlertRuleRow | null {
  if (!rule.updatedAt || receivedAt >= rule.updatedAt.getTime()) return rule;
  return (
    versions?.filter((version) => version.effectiveAt <= receivedAt).at(-1)
      ?.rule ?? null
  );
}

interface RuleState {
  eventId: string;
  receivedAt: number;
  sourceTime: number;
  value: number | null;
  lastTriggeredAt: number;
  ruleRevision?: number;
  candidate?: boolean;
  candidateSource?: number;
  candidateReceived?: number;
}

/** A duration requires good, ordered observations on both clocks; a gap is not evidence. */
export function stabilizedCondition(
  rule: Pick<
    AlertRuleRow,
    | "debounceSeconds"
    | "clearDebounceSeconds"
    | "rateWindowSeconds"
    | "updatedAt"
  >,
  condition: boolean | null,
  active: boolean,
  state: RuleState,
  previous?: RuleState,
): boolean | null {
  state.ruleRevision = rule.updatedAt?.getTime() ?? 0;
  if (previous && state.sourceTime < previous.sourceTime) {
    state.value = null;
    state.sourceTime = previous.sourceTime;
    return null;
  }
  if (condition === null) return null;
  if (condition === active) return condition;
  const duration =
    (condition ? rule.debounceSeconds : rule.clearDebounceSeconds) * 1000;
  if (!duration) return condition;
  const continuous =
    previous?.value != null &&
    previous.ruleRevision === state.ruleRevision &&
    state.sourceTime - previous.sourceTime <=
      (rule.rateWindowSeconds ?? 60) * 1000 &&
    state.receivedAt - previous.receivedAt <=
      (rule.rateWindowSeconds ?? 60) * 1000;
  state.candidate = condition;
  state.candidateSource =
    continuous && previous?.candidate === condition
      ? previous.candidateSource
      : state.sourceTime;
  state.candidateReceived =
    continuous && previous?.candidate === condition
      ? previous.candidateReceived
      : state.receivedAt;
  return state.sourceTime - (state.candidateSource ?? state.sourceTime) >=
    duration &&
    state.receivedAt - (state.candidateReceived ?? state.receivedAt) >= duration
    ? condition
    : active;
}

export const alarmConditions = [
  "gt",
  "gte",
  "lt",
  "lte",
  "eq",
  "neq",
  "between",
  "outside",
  "range",
  "rate_of_change",
  "state_change",
] as const;

export function evaluateCondition(
  rule: Pick<
    AlertRuleRow,
    "condition" | "threshold" | "thresholdHigh" | "rateWindowSeconds"
  > & { hysteresis?: number },
  value: number,
  sourceTime: number,
  previous?: Pick<RuleState, "value" | "sourceTime">,
  active = false,
): boolean | null {
  const adjustment = active ? (rule.hysteresis ?? 0) : 0;
  const low =
    rule.threshold == null
      ? null
      : rule.threshold +
        (["gt", "gte"].includes(rule.condition)
          ? -adjustment
          : ["lt", "lte"].includes(rule.condition)
            ? adjustment
            : 0);
  const high = rule.thresholdHigh;
  if (
    rule.condition === "state_change" ||
    rule.condition === "rate_of_change"
  ) {
    const elapsed = previous ? (sourceTime - previous.sourceTime) / 1000 : 0;
    if (
      previous?.value == null ||
      elapsed <= 0 ||
      elapsed > (rule.rateWindowSeconds ?? 60)
    )
      return null;
    return rule.condition === "state_change"
      ? value !== previous.value
      : low != null && Math.abs(value - previous.value) / elapsed > low;
  }
  if (low == null) return null;
  switch (rule.condition) {
    case "gt":
      return value > low;
    case "gte":
      return value >= low;
    case "lt":
      return value < low;
    case "lte":
      return value <= low;
    case "eq":
      return value === low;
    case "neq":
      return value !== low;
    case "between":
      return high == null ? null : value >= low && value <= high;
    case "range":
    case "outside":
      return high == null ? null : value < low || value > high;
    default:
      return null;
  }
}

export function toAlarmEvent(row: AlertHistoryRow): AlarmEvent {
  return {
    conditionState:
      (row.metadata as { conditionState?: "active" | "clear" | "unknown" })
        ?.conditionState ?? "unknown",
    id: row.id,
    ruleId: row.ruleId ?? 0,
    machineId: row.machineId,
    nodeKey: row.nodeKey ?? "",
    severity: row.severity ?? "info",
    status: row.status ?? "active",
    message: row.message ?? "",
    source: row.ruleName ?? "",
    value: row.triggerValue,
    threshold: row.threshold,
    triggeredAt: row.createdAt?.toISOString() ?? "",
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    clearedAt: row.resolvedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedBy,
  };
}

type AlarmTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function queueTransition(
  tx: AlarmTransaction,
  row: AlertHistoryRow,
  triggered: boolean,
  at: Date,
) {
  const event = {
    type: triggered ? "alarm.triggered" : "alarm.cleared",
    payload: toAlarmEvent(row),
    timestamp: at.toISOString(),
  };
  const destinations = await tx
    .select()
    .from(webhooks)
    .where(eq(webhooks.isActive, true));
  for (const destination of destinations)
    if (routesAlarm(destination, event.type, row.severity, row.machineId))
      await tx
        .insert(webhookDeliveries)
        .values({ webhookId: destination.id, event });
}

export class AlarmEvaluator extends EventEmitter {
  private rules?: AlertRuleRow[];
  private versions = new Map<number, RuleVersion[]>();

  async loadRules(): Promise<void> {
    const rules = await alarmRepository.getAllActiveRules();
    const ids = rules.map((rule) => rule.id);
    const rows = ids.length
      ? await db
          .select()
          .from(alertRuleVersions)
          .where(inArray(alertRuleVersions.ruleId, ids))
          .orderBy(
            asc(alertRuleVersions.effectiveAt),
            asc(alertRuleVersions.id),
          )
      : [];
    this.versions = new Map();
    for (const row of rows)
      this.versions.set(row.ruleId, [
        ...(this.versions.get(row.ruleId) ?? []),
        {
          effectiveAt: row.effectiveAt.getTime(),
          rule: ruleFromSnapshot(row.rule),
        },
      ]);
    this.rules = rules.filter((rule) => rule.plantId == null);
  }
  async reloadRules(): Promise<void> {
    await this.loadRules();
  }

  async observeHealth(
    key: string,
    machineId: number | null,
    breached: boolean | null,
    name: string,
    message: string,
  ): Promise<void> {
    let changed: AlertHistoryRow | undefined;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`health:${key}`}))`,
      );
      const [active] = await tx
        .select()
        .from(alertHistory)
        .where(
          and(
            sql`${alertHistory.metadata}->>'healthKey' = ${key}`,
            isNull(alertHistory.resolvedAt),
          ),
        )
        .limit(1);
      const metadata = {
        healthKey: key,
        conditionState:
          breached === null ? "unknown" : breached ? "active" : "clear",
      };
      if (!active && breached) {
        [changed] = await tx
          .insert(alertHistory)
          .values({
            machineId,
            nodeKey: `health:${key}`,
            ruleName: name,
            severity: "high",
            status: "active",
            message,
            createdAt: now,
            metadata,
          })
          .returning();
      } else if (active && breached === false) {
        [changed] = await tx
          .update(alertHistory)
          .set({ status: "resolved", resolvedAt: now, metadata })
          .where(eq(alertHistory.id, active.id))
          .returning();
      } else if (active) {
        await tx
          .update(alertHistory)
          .set({ metadata, message })
          .where(eq(alertHistory.id, active.id));
      }
      if (changed) await queueTransition(tx, changed, breached === true, now);
    });
    if (changed)
      this.emit(breached ? "alarmTriggered" : "alarmCleared", changed);
  }

  // Called serially by the durable collector, before acknowledging the spool batch.
  async evaluate(entry: SpoolEntry): Promise<void> {
    const data = entry.data;
    if (data.machineId == null) return;
    if (!this.rules) await this.loadRules();
    for (const current of this.rules!) {
      if (
        current.nodeKey !== data.key ||
        (current.machineId != null && current.machineId !== data.machineId)
      )
        continue;
      const key = `${current.id}:${data.machineId}`;
      const receivedAt = new Date(data.receivedAt ?? data.timestamp).getTime();
      if (current.createdAt && receivedAt < current.createdAt.getTime())
        continue;
      const rule = ruleAt(current, this.versions.get(current.id), receivedAt);
      if (
        !rule ||
        rule.isActive === false ||
        rule.nodeKey !== data.key ||
        (rule.machineId != null && rule.machineId !== data.machineId)
      ) {
        logger.warn(
          `[Alarm] Sample ${entry.id} received before rule ${current.id} changed is not evaluated: no matching active version covers its receipt time`,
        );
        continue;
      }
      const sourceTime = new Date(
        data.sourceTimestamp ?? data.timestamp,
      ).getTime();
      const scalar =
        typeof data.value === "boolean" ? Number(data.value) : data.value;
      const value =
        data.statusCode?.startsWith("Good") &&
        typeof scalar === "number" &&
        Number.isFinite(scalar)
          ? scalar
          : null;
      let changed: AlertHistoryRow | undefined;
      let eventName = "alarmUpdated";
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
        const receipt = await tx
          .insert(alarmEvaluationReceipts)
          .values({ key: `${rule.id}:${entry.id}`, ruleId: rule.id })
          .onConflictDoNothing()
          .returning();
        if (!receipt.length) return;
        const [saved] = await tx
          .select()
          .from(alarmEvaluationState)
          .where(eq(alarmEvaluationState.key, key));
        const previous = saved?.state as RuleState | undefined;
        if (previous && receivedAt < previous.receivedAt) return;
        const state: RuleState = {
          eventId: entry.id,
          receivedAt,
          sourceTime,
          value,
          lastTriggeredAt: previous?.lastTriggeredAt ?? 0,
        };
        // Adopt existing incidents on upgrade; acknowledgment must not create a second incident.
        const [active] = await tx
          .select()
          .from(alertHistory)
          .where(
            and(
              eq(alertHistory.ruleId, rule.id),
              eq(alertHistory.machineId, data.machineId!),
              isNull(alertHistory.resolvedAt),
            ),
          )
          .orderBy(desc(alertHistory.id))
          .limit(1);
        if (!previous && active?.createdAt)
          state.lastTriggeredAt = active.createdAt.getTime();
        const measuredCondition =
          value == null
            ? null
            : evaluateCondition(rule, value, sourceTime, previous, !!active);
        const condition = stabilizedCondition(
          rule,
          measuredCondition,
          !!active,
          state,
          previous,
        );
        const conditionState =
          condition == null ? "unknown" : condition ? "active" : "clear";
        if (active) {
          const metadata = {
            ...(active.metadata as Record<string, unknown>),
            conditionState,
            lastSourceTime: new Date(sourceTime).toISOString(),
          };
          if (condition === false) {
            [changed] = await tx
              .update(alertHistory)
              .set({
                status: "resolved",
                resolvedAt: new Date(receivedAt),
                metadata,
              })
              .where(eq(alertHistory.id, active.id))
              .returning();
            eventName = "alarmCleared";
          } else if (
            (active.metadata as Record<string, unknown>)?.conditionState !==
            conditionState
          ) {
            [changed] = await tx
              .update(alertHistory)
              .set({ metadata })
              .where(eq(alertHistory.id, active.id))
              .returning();
          }
        } else if (
          condition &&
          receivedAt - state.lastTriggeredAt >=
            (rule.cooldownSeconds ?? 300) * 1000
        ) {
          [changed] = await tx
            .insert(alertHistory)
            .values({
              ruleId: rule.id,
              ruleName: rule.name,
              machineId: data.machineId,
              nodeKey: data.key,
              triggerValue: value,
              threshold: rule.threshold,
              severity: rule.severity,
              status: "active",
              message: `${rule.name}: ${value} (${rule.condition} ${rule.threshold ?? "previous value"})`,
              createdAt: new Date(receivedAt),
              metadata: {
                conditionState,
                sourceTime: new Date(sourceTime).toISOString(),
                eventId: entry.id,
                ruleVersion: rule.updatedAt?.toISOString() ?? null,
              },
            })
            .returning();
          state.lastTriggeredAt = receivedAt;
          eventName = "alarmTriggered";
        }
        if (changed && eventName !== "alarmUpdated")
          await queueTransition(
            tx,
            changed,
            eventName === "alarmTriggered",
            new Date(receivedAt),
          );
        await tx
          .insert(alarmEvaluationState)
          .values({ key, ruleId: rule.id, state })
          .onConflictDoUpdate({
            target: alarmEvaluationState.key,
            set: { state },
          });
      });
      if (changed) this.emit(eventName, changed);
    }
  }

  async acknowledge(
    id: number,
    userId: number,
  ): Promise<AlertHistoryRow | null> {
    const row = await alarmRepository.acknowledgeAlarm(id, userId);
    if (row) this.emit("alarmAcknowledged", row);
    return row;
  }
}

export default new AlarmEvaluator();
