import { EventEmitter } from "node:events";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  alertHistory,
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

interface RuleState {
  eventId: string;
  receivedAt: number;
  sourceTime: number;
  value: number | null;
  lastTriggeredAt: number;
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
  >,
  value: number,
  sourceTime: number,
  previous?: Pick<RuleState, "value" | "sourceTime">,
): boolean | null {
  const low = rule.threshold;
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

export class AlarmEvaluator extends EventEmitter {
  private rules?: AlertRuleRow[];

  async loadRules(): Promise<void> {
    const rules = await alarmRepository.getAllActiveRules();
    this.rules = rules.filter((rule) => rule.plantId == null);
  }
  async reloadRules(): Promise<void> {
    await this.loadRules();
  }

  // Called serially by the durable collector, before acknowledging the spool batch.
  async evaluate(entry: SpoolEntry): Promise<void> {
    const data = entry.data;
    if (data.machineId == null) return;
    if (!this.rules) await this.loadRules();
    for (const rule of this.rules!) {
      if (
        rule.nodeKey !== data.key ||
        (rule.machineId != null && rule.machineId !== data.machineId)
      )
        continue;
      const key = `${rule.id}:${data.machineId}`;
      const receivedAt = new Date(data.receivedAt ?? data.timestamp).getTime();
      if (rule.createdAt && receivedAt < rule.createdAt.getTime()) continue;
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
        const condition =
          value == null
            ? null
            : evaluateCondition(rule, value, sourceTime, previous);
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
              },
            })
            .returning();
          state.lastTriggeredAt = receivedAt;
          eventName = "alarmTriggered";
        }
        if (changed && eventName !== "alarmUpdated") {
          const event = {
            type:
              eventName === "alarmTriggered"
                ? "alarm.triggered"
                : "alarm.cleared",
            payload: toAlarmEvent(changed),
            timestamp: new Date(receivedAt).toISOString(),
          };
          const destinations = await tx
            .select()
            .from(webhooks)
            .where(eq(webhooks.isActive, true));
          for (const destination of destinations) {
            const events = destination.events as string[];
            if (events.includes(event.type) || events.includes("*"))
              await tx
                .insert(webhookDeliveries)
                .values({ webhookId: destination.id, event });
          }
        }
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
