import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import type {
  ProductionInterval,
  ProductionProfile,
} from "@performance-dashboard/shared";
import db from "../database/db.js";
import { machineProfiles, opcuaData } from "../database/schema.js";
import { ValidationError } from "../utils/errors.js";
import { stateTimeline } from "./shiftCalculation.js";

export interface Reliability {
  failures: number;
  runningSeconds: number;
  faultSeconds: number;
  unknownSeconds: number;
  /** Mean time between failures: running time per failure; null without a failure. */
  mtbfSeconds: number | null;
  /** Mean time to repair: fault time per failure; null without a failure. */
  mttrSeconds: number | null;
  /** False when unknown time could hide a failure or its repair. */
  complete: boolean;
}

/**
 * MTBF/MTTR from observed states. A failure is a fault run that starts after an observed
 * non-fault state; a fault already running at the window start, or emerging from unknown
 * data, is not counted as a new failure (its start was not observed). Unknown stays unknown.
 */
export function reliabilityFromIntervals(
  intervals: ProductionInterval[],
): Reliability {
  let failures = 0,
    runningSeconds = 0,
    faultSeconds = 0,
    unknownSeconds = 0;
  intervals.forEach((interval, i) => {
    const seconds =
      (Date.parse(interval.end) - Date.parse(interval.start)) / 1000;
    if (interval.state === "running") runningSeconds += seconds;
    if (interval.state === "unknown") unknownSeconds += seconds;
    if (interval.state !== "fault") return;
    faultSeconds += seconds;
    const before = intervals[i - 1]?.state;
    if (before && before !== "unknown" && before !== "fault") failures++;
  });
  return {
    failures,
    runningSeconds,
    faultSeconds,
    unknownSeconds,
    mtbfSeconds: failures ? runningSeconds / failures : null,
    mttrSeconds: failures ? faultSeconds / failures : null,
    complete: unknownSeconds === 0,
  };
}

const MAX_DAYS = 31;

/** Reliability of one machine's latest production profile over at most 31 days. */
export async function machineReliability(
  machineId: number,
  from: Date,
  to: Date,
): Promise<Reliability & { profiled: boolean }> {
  if (!(to > from) || +to - +from > MAX_DAYS * 86_400_000)
    throw new ValidationError(`Choose a range of up to ${MAX_DAYS} days`);
  const [latest] = await db
    .select()
    .from(machineProfiles)
    .where(eq(machineProfiles.machineId, machineId))
    .orderBy(desc(machineProfiles.id))
    .limit(1);
  const profile = latest?.profile as ProductionProfile | undefined;
  const signal = profile?.signals.state;
  if (!profile || !signal) {
    // Without a commissioned state signal everything is unknown, never "no failures".
    const unknownSeconds = (+to - +from) / 1000;
    return {
      ...reliabilityFromIntervals([
        { start: from.toISOString(), end: to.toISOString(), state: "unknown" },
      ]),
      unknownSeconds,
      profiled: false,
    };
  }
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
        eq(opcuaData.machineId, machineId),
        eq(opcuaData.nodeKey, signal.nodeKey),
        gte(
          opcuaData.timestamp,
          new Date(+from - profile.maxGapSeconds * 1000),
        ),
        lte(opcuaData.timestamp, to),
      ),
    )
    .orderBy(asc(opcuaData.timestamp), asc(opcuaData.id))
    .limit(500_001);
  if (rows.length > 500_000)
    throw new ValidationError("Too many samples; choose a shorter range");
  // A sample from another signal under the same key is not this machine's state.
  const samples = rows.map((row) => ({
    timestamp: row.timestamp,
    statusCode: row.statusCode,
    value:
      row.signalMetadata?.namespaceUri === signal.namespaceUri &&
      row.signalMetadata.identifier === signal.identifier
        ? row.value
        : null,
  }));
  return {
    ...reliabilityFromIntervals(stateTimeline(samples, profile, from, to)),
    profiled: true,
  };
}
