import type { ComparisonSnapshot } from "./periodComparison.js";
import { canonicalJson } from "../utils/canonicalJson.js";

export type ImprovementReason =
  | "unverified"
  | "coverage"
  | "definitions"
  | "timing"
  | "product-mix"
  | "energy-unavailable"
  | "energy-definition";

/** Largest allowed difference between the two sides' product-mix shares. */
export const MIX_TOLERANCE = 0.05;

function side(reports: ComparisonSnapshot[]) {
  const scheduled = reports.reduce((s, r) => s + r.scheduledSeconds, 0);
  const counts = reports.every(
    (r) =>
      r.quantities.good != null &&
      r.quantities.total != null &&
      r.quantities.reject != null &&
      r.quantities.total === r.quantities.good + r.quantities.reject,
  );
  const good = counts
    ? reports.reduce((s, r) => s + r.quantities.good!, 0)
    : null;
  const mix = new Map<string, number>();
  for (const r of reports)
    for (const run of r.runs?.length
      ? r.runs.map((x) => ({
          key: canonicalJson([x.plan.product, x.plan.idealCycleMs]),
          seconds: x.report.scheduledSeconds,
        }))
      : [
          {
            key: canonicalJson([r.job.product, r.profile.idealCycleMs]),
            seconds: r.scheduledSeconds,
          },
        ])
      mix.set(run.key, (mix.get(run.key) ?? 0) + run.seconds);
  const energy = reports.every(
    (r) =>
      r.energy?.configured &&
      r.energy.complete &&
      r.energy.kWhPerGoodPart != null,
  );
  return {
    shifts: reports.length,
    scheduledHours: scheduled / 3600,
    productMix: Object.fromEntries(
      [...mix].map(([key, seconds]) => [
        key,
        scheduled ? seconds / scheduled : 0,
      ]),
    ),
    meterCoverage:
      reports.filter((r) => r.energy?.complete).length / reports.length,
    goodPerScheduledHour:
      good != null && scheduled ? good / (scheduled / 3600) : null,
    availability:
      reports.every((r) => r.oee.availability != null) && scheduled
        ? reports.reduce(
            (s, r) => s + r.oee.availability! * r.scheduledSeconds,
            0,
          ) / scheduled
        : null,
    idleFaultShare: scheduled
      ? reports.reduce((s, r) => s + r.seconds.idle + r.seconds.fault, 0) /
        scheduled
      : null,
    kWhPerGoodPart:
      energy && good
        ? reports.reduce(
            (s, r) => s + r.energy!.kWhPerGoodPart! * r.quantities.good!,
            0,
          ) / good
        : null,
  };
}

/**
 * Before/after evaluation of one improvement action from frozen shift report revisions,
 * normalised per scheduled hour. A delta is withheld while a reason applies; product mix,
 * operating hours and meter coverage stay visible because a difference here is an
 * association with the action, never proof that it caused the change.
 */
export function evaluateImprovement(
  implementedAt: Date,
  before: ComparisonSnapshot[],
  after: ComparisonSnapshot[],
) {
  const reasons: ImprovementReason[] = [];
  const all = [...before, ...after];
  if (all.some((r) => !r.verified || r.issues.length))
    reasons.push("unverified");
  if (all.some((r) => r.seconds.unknown > 0)) reasons.push("coverage");
  const semantics = (r: ComparisonSnapshot) =>
    canonicalJson({
      signals: r.profile.signals,
      states: r.profile.states,
      counterPolicy: r.profile.counterPolicy,
      counterModulus: r.profile.counterModulus ?? null,
      maxGapSeconds: r.profile.maxGapSeconds,
    });
  if (new Set(all.map(semantics)).size > 1) reasons.push("definitions");
  if (
    before.some((r) => Date.parse(r.end) > implementedAt.getTime()) ||
    after.some((r) => Date.parse(r.start) < implementedAt.getTime())
  )
    reasons.push("timing");
  const a = side(before),
    b = side(after);
  const keys = new Set([
    ...Object.keys(a.productMix),
    ...Object.keys(b.productMix),
  ]);
  if (
    [...keys].some(
      (k) =>
        Math.abs((a.productMix[k] ?? 0) - (b.productMix[k] ?? 0)) >
        MIX_TOLERANCE,
    )
  )
    reasons.push("product-mix");
  const energyReasons: ImprovementReason[] =
    a.kWhPerGoodPart == null || b.kWhPerGoodPart == null
      ? ["energy-unavailable"]
      : new Set(all.map((r) => canonicalJson(r.energy?.meter ?? null))).size > 1
        ? ["energy-definition"]
        : [];
  const metric = (
    key:
      | "goodPerScheduledHour"
      | "availability"
      | "idleFaultShare"
      | "kWhPerGoodPart",
    extra: ImprovementReason[] = [],
  ) => {
    const blocked = [...reasons, ...extra];
    const x = a[key],
      y = b[key];
    return {
      key,
      before: x,
      after: y,
      delta: !blocked.length && x != null && y != null ? y - x : null,
      reasons: blocked,
    };
  };
  return {
    version: "improvement-evaluation-v1" as const,
    comparable: reasons.length === 0,
    reasons,
    context: {
      before: {
        shifts: a.shifts,
        scheduledHours: a.scheduledHours,
        productMix: a.productMix,
        meterCoverage: a.meterCoverage,
      },
      after: {
        shifts: b.shifts,
        scheduledHours: b.scheduledHours,
        productMix: b.productMix,
        meterCoverage: b.meterCoverage,
      },
    },
    metrics: [
      metric("goodPerScheduledHour"),
      metric("availability"),
      metric("idleFaultShare"),
      metric("kWhPerGoodPart", energyReasons),
    ],
  };
}
