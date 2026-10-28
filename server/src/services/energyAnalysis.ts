import type {
  ProductionInterval,
  ProductionSignal,
  ShiftReport,
} from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  energyMeters,
  energyReconciliations,
  opcuaData,
} from "../database/schema.js";
import { eq, and, gte, lte, asc, desc } from "drizzle-orm";
import { ValidationError } from "../utils/errors.js";
export interface EnergyMeter {
  signal: ProductionSignal;
  maxGapSeconds: number;
  modulus: number | null;
}
export interface EnergySample {
  timestamp: Date;
  value: number | null;
  status_code: string | null;
  signal_metadata: { namespaceUri?: string; identifier?: string } | null;
  correctionRevision?: number;
}
export function calculateEnergy(
  samples: EnergySample[],
  meter: EnergyMeter,
  start: Date,
  end: Date,
  intervals: ProductionInterval[],
) {
  let kWh = 0,
    idleKWh = 0,
    unassignedKWh = 0,
    coveredSeconds = 0,
    usable = 0;
  const valid = (s: EnergySample) =>
    s.value != null &&
    Number.isFinite(s.value) &&
    s.value >= 0 &&
    (!meter.modulus || s.value < meter.modulus) &&
    s.status_code?.startsWith("Good") &&
    s.signal_metadata?.namespaceUri === meter.signal.namespaceUri &&
    s.signal_metadata.identifier === meter.signal.identifier;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      seconds = (b.timestamp.getTime() - a.timestamp.getTime()) / 1000;
    if (
      !valid(a) ||
      !valid(b) ||
      a.timestamp < start ||
      b.timestamp > end ||
      seconds <= 0 ||
      seconds > meter.maxGapSeconds
    )
      continue;
    let delta = b.value! - a.value!;
    if (delta < 0) {
      if (
        meter.modulus &&
        a.value! >= meter.modulus * 0.9 &&
        b.value! <= meter.modulus * 0.1
      )
        delta += meter.modulus;
      else continue;
    }
    const energy =
      delta * meter.signal.scale * (meter.signal.unit === "Wh" ? 0.001 : 1);
    if (!Number.isFinite(energy) || !Number.isFinite(kWh + energy)) continue;
    kWh += energy;
    coveredSeconds += seconds;
    usable++;
    const covering = intervals.filter(
      (s) =>
        Date.parse(s.start) < b.timestamp.getTime() &&
        Date.parse(s.end) > a.timestamp.getTime(),
    );
    const coverage = covering.reduce(
      (sum, s) =>
        sum +
        Math.max(
          0,
          Math.min(Date.parse(s.end), b.timestamp.getTime()) -
            Math.max(Date.parse(s.start), a.timestamp.getTime()),
        ),
      0,
    );
    if (
      coverage === seconds * 1000 &&
      covering.every((s) => s.state === "idle")
    )
      idleKWh += energy;
    else if (
      coverage !== seconds * 1000 ||
      covering.some((s) => s.state === "unknown") ||
      new Set(covering.map((s) => s.state)).size > 1
    )
      unassignedKWh += energy;
  }
  return {
    observedKWh: usable ? kWh : null,
    idleKWh: usable ? idleKWh : null,
    unassignedKWh: usable ? unassignedKWh : null,
    coveredSeconds,
    complete:
      usable > 0 && coveredSeconds === (end.getTime() - start.getTime()) / 1000,
  };
}
export async function loadEnergySamples(
  report: ShiftReport,
  database: Pick<typeof db, "select" | "selectDistinctOn"> = db,
) {
  const [meter] = await database
    .select()
    .from(energyMeters)
    .where(eq(energyMeters.machineId, report.machineId));
  if (!meter) return null;
  const config = meter.config as EnergyMeter;
  const rows = await database
    .selectDistinctOn([opcuaData.timestamp], {
      timestamp: opcuaData.timestamp,
      value: opcuaData.value,
      status_code: opcuaData.statusCode,
      signal_metadata: opcuaData.signalMetadata,
      correctionRevision: opcuaData.correctionRevision,
    })
    .from(opcuaData)
    .where(
      and(
        eq(opcuaData.machineId, report.machineId),
        eq(opcuaData.nodeKey, config.signal.nodeKey),
        gte(opcuaData.timestamp, new Date(report.start)),
        lte(opcuaData.timestamp, new Date(report.end)),
      ),
    )
    .orderBy(asc(opcuaData.timestamp), desc(opcuaData.id))
    .limit(200001);
  if (rows.length > 200000)
    throw new ValidationError(
      "Energy analysis exceeds 200000 samples; use shorter shifts",
    );
  return { meter, config, rows };
}
export async function energyAnalysis(
  report: ShiftReport,
  database: Pick<typeof db, "select" | "selectDistinctOn"> = db,
) {
  const source = await loadEnergySamples(report, database);
  if (!source)
    return { configured: false, observedKWh: null, kWhPerGoodPart: null };
  const { meter, config, rows } = source;
  const energy = calculateEnergy(
    rows,
    config,
    new Date(report.start),
    new Date(report.end),
    report.intervals,
  );
  const [independent] = await database
    .select()
    .from(energyReconciliations)
    .where(eq(energyReconciliations.shiftId, report.id));
  const good = report.quantities.good,
    goodComplete = !report.issues.some(
      (issue) =>
        issue.startsWith("good counter") || issue.startsWith("Missing good"),
    );
  const replaced = new Set(report.reasons.map((r) => r.supersedesId));
  const reasons = report.reasons.filter((r) => !replaced.has(r.id));
  let changeoverSeconds = 0;
  for (const interval of report.intervals)
    if (interval.state !== "running" && interval.state !== "unknown")
      for (const reason of reasons)
        if (reason.category === "changeover")
          changeoverSeconds +=
            Math.max(
              0,
              Math.min(Date.parse(interval.end), Date.parse(reason.end)) -
                Math.max(Date.parse(interval.start), Date.parse(reason.start)),
            ) / 1000;
  return {
    configured: true,
    meterVersion: meter.version,
    correctedSampleCount: rows.filter((row) => row.correctionRevision > 0)
      .length,
    meter: config,
    ...energy,
    independent: independent ?? null,
    differenceKWh:
      independent && energy.observedKWh != null
        ? energy.observedKWh - independent.kWh
        : null,
    reconciled:
      !!independent &&
      energy.complete &&
      energy.observedKWh != null &&
      Math.abs(energy.observedKWh - independent.kWh) <=
        independent.toleranceKWh,
    goodParts: goodComplete ? good : null,
    kWhPerGoodPart:
      energy.complete && goodComplete && good != null && good > 0
        ? energy.observedKWh! / good
        : null,
    changeoverSeconds,
    unknownStateSeconds: report.seconds.unknown,
    losses: report.losses.filter((loss) => loss.reason !== "Unknown data"),
    attribution:
      "Energy crossing a state transition or unknown interval is unassigned. Counter decreases are unknown unless a configured rollover is observed.",
  };
}
