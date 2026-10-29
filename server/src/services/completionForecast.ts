import type { ComparisonSnapshot } from "./periodComparison.js";

// X04: advisory completion estimates from comparable verified runs. Nothing is rescheduled.
export const MIN_COMPARABLE_RUNS = 10;
export const FORECAST_VERSION = "completion-forecast-v1";

export interface ComparableRun {
  revisionId: number;
  product: string;
  start: string;
  good: number;
  scheduledHours: number;
  /** Good parts per scheduled hour. */
  rate: number;
}
type Excluded = Record<
  | "unverified"
  | "incompleteCoverage"
  | "noGoodCount"
  | "beforeProcessChange"
  | "otherProduct",
  number
>;

/**
 * Runs of one product from verified, fully covered revisions after the latest declared
 * process change. A shift without planned runs counts as one run of its job's product.
 * A run is measured over its planned window; actual run ends are not recorded.
 */
export function comparableRuns(
  revisions: { revisionId: number; snapshot: ComparisonSnapshot }[],
  product: string,
  processChangeAt: Date | null,
) {
  const runs: ComparableRun[] = [];
  const excluded: Excluded = {
    unverified: 0,
    incompleteCoverage: 0,
    noGoodCount: 0,
    beforeProcessChange: 0,
    otherProduct: 0,
  };
  const products = new Set<string>();
  for (const { revisionId, snapshot } of revisions) {
    const parts = snapshot.runs?.length
      ? snapshot.runs.map((run) => ({
          product: run.plan.product,
          start: run.plan.start,
          end: run.plan.end,
          report: run.report,
        }))
      : [
          {
            product: snapshot.job.product,
            start: snapshot.start,
            end: snapshot.end,
            report: snapshot,
          },
        ];
    for (const part of parts) {
      if (part.product) products.add(part.product);
      if (part.product !== product) excluded.otherProduct += 1;
      else if (!snapshot.verified || !part.report.verified)
        excluded.unverified += 1;
      else if (part.report.seconds.unknown > 0)
        excluded.incompleteCoverage += 1;
      else if (part.report.quantities.good == null) excluded.noGoodCount += 1;
      else if (
        processChangeAt &&
        Date.parse(part.start) < processChangeAt.getTime()
      )
        excluded.beforeProcessChange += 1;
      else {
        const scheduledHours =
          (Date.parse(part.end) - Date.parse(part.start)) / 3600_000;
        if (scheduledHours <= 0) continue;
        const good = part.report.quantities.good;
        runs.push({
          revisionId,
          product,
          start: part.start,
          good,
          scheduledHours,
          rate: good / scheduledHours,
        });
      }
    }
  }
  return { runs, excluded, products: [...products].sort() };
}

/** Linear-interpolated quantile of sorted values. */
export function quantile(sorted: number[], q: number) {
  const at = (sorted.length - 1) * q,
    low = Math.floor(at);
  return (
    sorted[low] +
    (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (at - low)
  );
}

/**
 * Hours needed for `remaining` good parts: the median rate gives the middle, the 90th and
 * 10th percentile rates the fast and slow ends. Withheld below MIN_COMPARABLE_RUNS.
 */
export function forecast(runs: ComparableRun[], remaining: number) {
  if (runs.length < MIN_COMPARABLE_RUNS)
    return {
      status: "withheld" as const,
      reason: `${runs.length} comparable verified run(s); at least ${MIN_COMPARABLE_RUNS} are needed`,
    };
  const rates = runs.map((r) => r.rate).sort((a, b) => a - b);
  const [slow, median, fast] = [0.1, 0.5, 0.9].map((q) => quantile(rates, q));
  const hours = (rate: number) => (rate > 0 ? remaining / rate : null);
  return {
    status: "estimate" as const,
    ratePerHour: { slow, median, fast },
    // A slowest rate of zero leaves the range open-ended (null).
    hours: { fast: hours(fast), median: hours(median), slow: hours(slow) },
  };
}

/**
 * Rolling-origin backtest: each run after the first MIN_COMPARABLE_RUNS is predicted from
 * the runs before it, for its actual good count, and compared with its scheduled hours.
 * The benchmark predicts with the mean of the earlier rates.
 */
export function backtest(runs: ComparableRun[]) {
  const ordered = [...runs].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  );
  let evaluated = 0,
    covered = 0;
  const errors: number[] = [],
    benchmarkErrors: number[] = [];
  for (let k = MIN_COMPARABLE_RUNS; k < ordered.length; k++) {
    const prior = ordered.slice(0, k);
    const target = ordered[k];
    const estimate = forecast(prior, target.good);
    if (estimate.status !== "estimate" || estimate.hours.median == null)
      continue;
    evaluated += 1;
    const { fast, slow, median } = estimate.hours;
    if (
      target.scheduledHours >= fast! &&
      (slow == null || target.scheduledHours <= slow)
    )
      covered += 1;
    errors.push(Math.abs(median - target.scheduledHours));
    const mean = prior.reduce((sum, r) => sum + r.rate, 0) / prior.length;
    if (mean > 0)
      benchmarkErrors.push(
        Math.abs(target.good / mean - target.scheduledHours),
      );
  }
  const middle = (values: number[]) =>
    values.length
      ? quantile(
          [...values].sort((a, b) => a - b),
          0.5,
        )
      : null;
  return {
    evaluated,
    intervalCoverage: evaluated ? covered / evaluated : null,
    medianAbsErrorHours: middle(errors),
    benchmarkMedianAbsErrorHours: middle(benchmarkErrors),
  };
}
