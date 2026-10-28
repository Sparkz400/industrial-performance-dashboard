import type {
  ComparisonPeriod,
  ComparisonReason,
  PeriodComparison,
  ShiftReport,
} from "@performance-dashboard/shared";
import { canonicalJson } from "../utils/canonicalJson.js";
import { ValidationError } from "../utils/errors.js";

export interface FrozenEnergy {
  configured: boolean;
  complete?: boolean;
  meter?: unknown;
  kWhPerGoodPart: number | null;
}
export type ComparisonSnapshot = ShiftReport & { energy?: FrozenEnergy };
export interface FrozenRevision {
  id: number;
  digest: string;
  createdAt: Date;
  createdBy: number;
  snapshot: ComparisonSnapshot;
}

function period(
  revision: FrozenRevision,
  latestRevisionId: number,
): ComparisonPeriod {
  const report = revision.snapshot;
  const mix = new Map<string, ComparisonPeriod["productMix"][number]>();
  const runs = report.runs?.length
    ? report.runs.map((r) => ({
        product: r.plan.product,
        idealCycleMs: r.plan.idealCycleMs,
        scheduledSeconds: r.report.scheduledSeconds,
      }))
    : [
        {
          product: report.job.product,
          idealCycleMs: report.profile.idealCycleMs,
          scheduledSeconds: report.scheduledSeconds,
        },
      ];
  for (const run of runs) {
    const key = canonicalJson([run.product, run.idealCycleMs]);
    const item = mix.get(key) ?? { ...run, scheduledSeconds: 0 };
    item.scheduledSeconds += run.scheduledSeconds;
    mix.set(key, item);
  }
  const productMix = [...mix.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, item]) => item);
  return {
    revisionId: revision.id,
    digest: revision.digest,
    savedAt: revision.createdAt.toISOString(),
    savedBy: revision.createdBy,
    latestRevisionId,
    report,
    productMix,
    unassignedScheduledSeconds: Math.max(
      0,
      report.scheduledSeconds -
        productMix.reduce((sum, r) => sum + r.scheduledSeconds, 0),
    ),
  };
}

/** Frozen evidence is compared as recorded; subsequent corrections never replace it silently. */
export function comparePeriods(
  beforeRevision: FrozenRevision,
  afterRevision: FrozenRevision,
  latestIds: [number, number],
) {
  const before = period(beforeRevision, latestIds[0]),
    after = period(afterRevision, latestIds[1]);
  const a = before.report,
    b = after.report;
  if (
    a.machineId !== b.machineId ||
    a.id === b.id ||
    Date.parse(a.end) > Date.parse(b.start)
  )
    throw new ValidationError(
      "Choose different, non-overlapping shifts on the same machine, with the earlier shift first",
    );
  const reasons: ComparisonReason[] = [];
  const completeCounts = (r: ShiftReport) =>
    Object.values(r.quantities).every(
      (v) => v != null && Number.isFinite(v) && v >= 0,
    ) && r.quantities.total === r.quantities.good! + r.quantities.reject!;
  if (
    !a.verified ||
    !b.verified ||
    a.issues.length ||
    b.issues.length ||
    !completeCounts(a) ||
    !completeCounts(b)
  )
    reasons.push("unverified");
  if (
    a.seconds.unknown ||
    b.seconds.unknown ||
    [...Object.values(a.seconds), ...Object.values(b.seconds)].some(
      (v) => !Number.isFinite(v) || v < 0,
    ) ||
    a.observedSeconds !== (Date.parse(a.end) - Date.parse(a.start)) / 1000 ||
    b.observedSeconds !== (Date.parse(b.end) - Date.parse(b.start)) / 1000
  )
    reasons.push("coverage");
  if (
    a.scheduledSeconds <= 0 ||
    ![
      a.scheduledSeconds,
      b.scheduledSeconds,
      a.plannedSeconds,
      b.plannedSeconds,
    ].every((v) => Number.isFinite(v) && v >= 0) ||
    a.scheduledSeconds !== b.scheduledSeconds ||
    a.plannedSeconds !== b.plannedSeconds
  )
    reasons.push("schedule");
  if (
    Date.parse(a.end) - Date.parse(a.start) !==
    Date.parse(b.end) - Date.parse(b.start)
  )
    reasons.push("duration");
  if (
    Date.parse(a.generatedAt) < Date.parse(a.end) ||
    Date.parse(b.generatedAt) < Date.parse(b.end)
  )
    reasons.push("unfinished");
  const semantics = (r: ShiftReport) => ({
    signals: r.profile.signals,
    states: r.profile.states,
    counterPolicy: r.profile.counterPolicy,
    counterModulus: r.profile.counterModulus ?? null,
    maxGapSeconds: r.profile.maxGapSeconds,
  });
  if (canonicalJson(semantics(a)) !== canonicalJson(semantics(b)))
    reasons.push("definitions");
  if (
    before.unassignedScheduledSeconds ||
    after.unassignedScheduledSeconds ||
    canonicalJson(before.productMix) !== canonicalJson(after.productMix)
  )
    reasons.push("product-mix");
  const finite = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) ? value : null;
  const metrics: PeriodComparison["metrics"] = [];
  const add = (
    key: PeriodComparison["metrics"][number]["key"],
    unit: PeriodComparison["metrics"][number]["unit"],
    x: number | null | undefined,
    y: number | null | undefined,
    extra: ComparisonReason[] = [],
  ) => {
    const left = finite(x),
      right = finite(y),
      blocked = [...reasons, ...extra];
    metrics.push({
      key,
      unit,
      before: left,
      after: right,
      delta:
        !blocked.length && left !== null && right !== null
          ? right - left
          : null,
      reasons: blocked,
    });
  };
  const rate = (r: ShiftReport) =>
    r.quantities.good != null && r.scheduledSeconds > 0
      ? (r.quantities.good / r.scheduledSeconds) * 3600
      : null;
  const percent = (v: number | null) => (v == null ? null : v * 100);
  add("goodPerHour", "parts/hour", rate(a), rate(b));
  add(
    "availability",
    "%",
    percent(a.oee.availability),
    percent(b.oee.availability),
  );
  add("quality", "%", percent(a.oee.quality), percent(b.oee.quality));
  add("oee", "%", percent(a.oee.overall), percent(b.oee.overall));
  add(
    "idleFaultSeconds",
    "seconds",
    a.seconds.idle + a.seconds.fault,
    b.seconds.idle + b.seconds.fault,
  );
  const ea = beforeRevision.snapshot.energy,
    eb = afterRevision.snapshot.energy;
  const energyReasons: ComparisonReason[] =
    !ea?.configured ||
    !eb?.configured ||
    !ea.complete ||
    !eb.complete ||
    finite(ea.kWhPerGoodPart) === null ||
    finite(eb.kWhPerGoodPart) === null
      ? ["energy-unavailable"]
      : [];
  if (
    !energyReasons.length &&
    (!ea?.meter ||
      !eb?.meter ||
      canonicalJson(ea.meter) !== canonicalJson(eb.meter))
  )
    energyReasons.push("energy-definition");
  add(
    "kWhPerGoodPart",
    "kWh/part",
    ea?.complete ? ea.kWhPerGoodPart : null,
    eb?.complete ? eb.kWhPerGoodPart : null,
    energyReasons,
  );
  return {
    version: "period-comparison-v1" as const,
    machineId: a.machineId,
    before,
    after,
    comparable: reasons.length === 0,
    reasons,
    metrics,
  };
}
