import { and, asc, desc, eq, gt, inArray, lte, gte, sql } from "drizzle-orm";
import type {
  MachineLiveSummary,
  ProductionProfile,
} from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  machines,
  machineProfiles,
  opcuaData,
  operatorEntries,
  productionShifts,
} from "../database/schema.js";
import { counterDeltas } from "./shiftCalculation.js";

type Sample = {
  timestamp: Date;
  receivedAt: Date | null;
  sourceTimestamp: Date | null;
  value: number | null;
  statusCode: string | null;
};
export function liveState(
  connection: string,
  sample: Sample | undefined,
  profile: ProductionProfile | undefined,
  now: Date,
): Pick<MachineLiveSummary, "state" | "freshness"> {
  const unknown = (freshness: MachineLiveSummary["freshness"]) => ({
    state: "unknown" as const,
    freshness,
  });
  if (connection !== "connected") return unknown("disconnected");
  if (!sample || !profile || !sample.receivedAt) return unknown("missing");
  if (
    sample.value == null ||
    !Number.isFinite(sample.value) ||
    !sample.statusCode?.startsWith("Good")
  )
    return unknown("bad-quality");
  const sourceTime = sample.sourceTimestamp ?? sample.timestamp;
  const receiveAge = now.getTime() - sample.receivedAt.getTime(),
    sourceAge = now.getTime() - sourceTime.getTime();
  if (receiveAge < -2000 || sourceAge < -2000) return unknown("clock-skew");
  if (Math.max(receiveAge, sourceAge) > profile.maxGapSeconds * 1000)
    return unknown("stale");
  const value = sample.value * profile.signals.state.scale;
  const state = Object.entries(profile.states).find(([, values]) =>
    values.includes(value),
  )?.[0] as MachineLiveSummary["state"] | undefined;
  return state ? { state, freshness: "fresh" } : unknown("bad-quality");
}

export async function liveProduction(
  ids?: number[],
  includeProgress = true,
): Promise<{ checkedAt: string; machines: MachineLiveSummary[] }> {
  const now = new Date();
  const assets = await db
    .select()
    .from(machines)
    .where(ids?.length ? inArray(machines.id, ids) : undefined)
    .orderBy(asc(machines.name))
    .limit(6);
  const summaries = await Promise.all(
    assets.map(async (machine): Promise<MachineLiveSummary> => {
      const [shift] = await db
        .select()
        .from(productionShifts)
        .where(
          and(
            eq(productionShifts.machineId, machine.id),
            lte(productionShifts.start, now),
            gt(productionShifts.end, now),
          ),
        )
        .limit(1);
      const [latest] = shift
        ? []
        : await db
            .select()
            .from(machineProfiles)
            .where(eq(machineProfiles.machineId, machine.id))
            .orderBy(desc(machineProfiles.id))
            .limit(1);
      const profile = (shift?.profile ?? latest?.profile) as
        ProductionProfile | undefined;
      const [last] = profile
        ? await db
            .select()
            .from(opcuaData)
            .where(
              and(
                eq(opcuaData.machineId, machine.id),
                eq(opcuaData.nodeKey, profile.signals.state.nodeKey),
              ),
            )
            .orderBy(desc(opcuaData.timestamp), desc(opcuaData.id))
            .limit(1)
        : [];
      const matches =
        last?.signalMetadata?.namespaceUri ===
          profile?.signals.state.namespaceUri &&
        last?.signalMetadata?.identifier === profile?.signals.state.identifier;
      const state = liveState(
        machine.status ?? "unknown",
        matches ? last : undefined,
        profile,
        now,
      );
      const issues = await db
        .select({
          id: operatorEntries.id,
          text: operatorEntries.text,
          priority: operatorEntries.priority,
          dueAt: operatorEntries.dueAt,
          kind: operatorEntries.kind,
        })
        .from(operatorEntries)
        .where(
          and(
            eq(operatorEntries.machineId, machine.id),
            eq(operatorEntries.status, "open"),
          ),
        )
        .orderBy(
          sql`CASE WHEN ${operatorEntries.priority} = 'high' THEN 0 ELSE 1 END`,
          asc(operatorEntries.dueAt),
          desc(operatorEntries.id),
        )
        .limit(5);
      let production: MachineLiveSummary["production"] = {
        observed: null,
        complete: false,
        asOf: null,
        truncated: false,
      };
      const total = profile?.signals.total;
      if (shift && total && includeProgress) {
        const rows = await db
          .select({
            timestamp: opcuaData.timestamp,
            value: opcuaData.value,
            statusCode: opcuaData.statusCode,
            signalMetadata: opcuaData.signalMetadata,
          })
          .from(opcuaData)
          .where(
            and(
              eq(opcuaData.machineId, machine.id),
              eq(opcuaData.nodeKey, total.nodeKey),
              gte(opcuaData.timestamp, shift.start),
              lte(opcuaData.timestamp, now),
            ),
          )
          .orderBy(asc(opcuaData.timestamp), asc(opcuaData.id))
          .limit(10001);
        if (rows.length > 10000) production.truncated = true;
        else {
          const unique = new Map(
            rows.map((row) => [
              row.timestamp.getTime(),
              {
                ...row,
                value:
                  row.signalMetadata?.namespaceUri === total.namespaceUri &&
                  row.signalMetadata.identifier === total.identifier
                    ? row.value
                    : null,
              },
            ]),
          );
          const result = counterDeltas(
            [...unique.values()],
            profile!,
            total.scale,
            shift.start,
            now,
          );
          production = {
            observed: result.count,
            complete: result.complete,
            asOf: rows.at(-1)?.timestamp.toISOString() ?? null,
            truncated: false,
          };
        }
      }
      return {
        id: machine.id,
        name: machine.name,
        connection: machine.status ?? "unknown",
        ...state,
        lastMeasurement: last
          ? (last.sourceTimestamp ?? last.timestamp).toISOString()
          : null,
        receivedAt: last?.receivedAt?.toISOString() ?? null,
        shift: shift
          ? {
              id: shift.id,
              name: shift.name,
              start: shift.start.toISOString(),
              end: shift.end.toISOString(),
              job: shift.job as NonNullable<MachineLiveSummary["shift"]>["job"],
            }
          : null,
        production,
        issues: issues.map((issue) => ({
          ...issue,
          dueAt: issue.dueAt?.toISOString() ?? null,
        })),
      };
    }),
  );
  return { checkedAt: now.toISOString(), machines: summaries };
}
