import { and, asc, eq, gte, lte, or, isNull, sql } from "drizzle-orm";
import type {
  IncidentReplay,
  ReplayEvent,
  ReplaySample,
  OperatorEntry,
} from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  machines,
  opcuaData,
  alertHistory,
  operatorEntries,
  operatorEntryEvents,
  downtimeReasons,
  productionShifts,
} from "../database/schema.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

const sampleLimit = 2000,
  eventLimit = 200;
const iso = (date: Date | null) => date?.toISOString() ?? null;
const metadataTime = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;

export async function incidentReplay(
  machineId: number,
  start: string,
  end: string,
  keys: string[],
  maxGapSeconds: number,
): Promise<IncidentReplay> {
  const from = new Date(start),
    to = new Date(end);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    to <= from ||
    to.getTime() - from.getTime() > 48 * 3600000
  )
    throw new ValidationError(
      "Replay window must be positive and at most 48 hours",
    );
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '3000'`);
      const [machine] = await tx
        .select({ id: machines.id, name: machines.name })
        .from(machines)
        .where(eq(machines.id, machineId));
      if (!machine) throw new NotFoundError("Machine");
      const signals: IncidentReplay["signals"] = [];
      for (const key of keys) {
        const rows = await tx
          .select()
          .from(opcuaData)
          .where(
            and(
              eq(opcuaData.machineId, machineId),
              eq(opcuaData.nodeKey, key),
              gte(opcuaData.timestamp, from),
              lte(opcuaData.timestamp, to),
            ),
          )
          .orderBy(asc(opcuaData.timestamp), asc(opcuaData.id))
          .limit(sampleLimit + 1);
        const samples: ReplaySample[] = rows
          .slice(0, sampleLimit)
          .map((row) => ({
            id: row.id,
            at: row.timestamp.toISOString(),
            sourceAt: iso(row.sourceTimestamp),
            receivedAt: iso(row.receivedAt),
            value: row.statusCode?.startsWith("Good") ? row.value : null,
            raw:
              typeof row.rawValue === "string"
                ? row.rawValue.slice(0, 512)
                : row.rawValue,
            rawTruncated:
              typeof row.rawValue === "string" && row.rawValue.length > 512,
            quality: row.statusCode,
            identity: row.signalMetadata,
          }));
        signals.push({ key, samples, truncated: rows.length > sampleLimit });
      }
      const alarms = await tx
        .select()
        .from(alertHistory)
        .where(
          and(
            eq(alertHistory.machineId, machineId),
            lte(alertHistory.createdAt, to),
            or(
              isNull(alertHistory.resolvedAt),
              gte(alertHistory.resolvedAt, from),
            ),
          ),
        )
        .orderBy(asc(alertHistory.createdAt), asc(alertHistory.id))
        .limit(eventLimit + 1);
      const notes = await tx
        .select({ event: operatorEntryEvents })
        .from(operatorEntryEvents)
        .innerJoin(
          operatorEntries,
          eq(operatorEntryEvents.entryId, operatorEntries.id),
        )
        .where(
          and(
            eq(operatorEntries.machineId, machineId),
            gte(operatorEntryEvents.createdAt, from),
            lte(operatorEntryEvents.createdAt, to),
          ),
        )
        .orderBy(
          asc(operatorEntryEvents.createdAt),
          asc(operatorEntryEvents.id),
        )
        .limit(eventLimit + 1);
      const reasons = await tx
        .select({ reason: downtimeReasons })
        .from(downtimeReasons)
        .innerJoin(
          productionShifts,
          eq(downtimeReasons.shiftId, productionShifts.id),
        )
        .where(
          and(
            eq(productionShifts.machineId, machineId),
            lte(downtimeReasons.start, to),
            gte(downtimeReasons.end, from),
          ),
        )
        .orderBy(asc(downtimeReasons.createdAt), asc(downtimeReasons.id))
        .limit(eventLimit + 1);
      const events: ReplayEvent[] = [];
      for (const alarm of alarms.slice(0, eventLimit)) {
        const metadata = (alarm.metadata ?? {}) as Record<string, unknown>;
        const base = {
          relatedId: alarm.id,
          text: `${alarm.ruleName ?? "Alarm"}: ${alarm.message ?? ""}`,
          details: {
            nodeKey: alarm.nodeKey,
            severity: alarm.severity,
            triggerValue: alarm.triggerValue,
            threshold: alarm.threshold,
          },
        };
        // Include an opening outside the window so an already-active incident retains its context.
        if (alarm.createdAt)
          events.push({
            ...base,
            id: `alarm-${alarm.id}`,
            at: alarm.createdAt.toISOString(),
            sourceAt: metadataTime(metadata.sourceTime),
            clock: "received",
            kind: "alarm",
            actorId: null,
          });
        if (alarm.acknowledgedAt && alarm.acknowledgedAt <= to)
          events.push({
            ...base,
            id: `ack-${alarm.id}`,
            at: alarm.acknowledgedAt.toISOString(),
            sourceAt: null,
            clock: "recorded",
            kind: "acknowledgment",
            actorId: alarm.acknowledgedBy,
          });
        if (alarm.resolvedAt && alarm.resolvedAt <= to)
          events.push({
            ...base,
            id: `recovery-${alarm.id}`,
            at: alarm.resolvedAt.toISOString(),
            sourceAt: metadataTime(metadata.lastSourceTime),
            clock: "received",
            kind: "recovery",
            actorId: null,
          });
      }
      for (const { event } of notes.slice(0, eventLimit)) {
        const entry = event.snapshot as OperatorEntry;
        events.push({
          id: `operator-${event.id}`,
          at: event.createdAt.toISOString(),
          sourceAt: null,
          clock: "recorded",
          kind: "operator",
          actorId: event.actorId,
          relatedId: event.entryId,
          text: entry.text,
          details: {
            version: event.version,
            kind: entry.kind,
            status: entry.status,
            priority: entry.priority,
            ownerId: entry.ownerId,
            dueAt: entry.dueAt,
            intervalStart: entry.intervalStart,
            intervalEnd: entry.intervalEnd,
            quantity: entry.quantity,
          },
        });
      }
      for (const { reason } of reasons.slice(0, eventLimit))
        events.push({
          id: `classification-${reason.id}`,
          at: reason.createdAt.toISOString(),
          sourceAt: null,
          clock: "recorded",
          kind: "classification",
          actorId: reason.actorId,
          relatedId: reason.id,
          text: reason.reason,
          details: {
            category: reason.category,
            start: reason.start.toISOString(),
            end: reason.end.toISOString(),
            supersedesId: reason.supersedesId,
          },
        });
      events.sort(
        (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
      );
      return {
        revision: "incident-replay-v1",
        machine,
        start: from.toISOString(),
        end: to.toISOString(),
        generatedAt: new Date().toISOString(),
        maxGapSeconds,
        signals,
        events,
        truncated: {
          alarms: alarms.length > eventLimit,
          operator: notes.length > eventLimit,
          classifications: reasons.length > eventLimit,
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
