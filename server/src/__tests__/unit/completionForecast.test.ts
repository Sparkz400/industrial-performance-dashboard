import { describe, expect, it } from "vitest";
import {
  backtest,
  comparableRuns,
  forecast,
  MIN_COMPARABLE_RUNS,
  quantile,
} from "../../services/completionForecast.js";
import type { ComparisonSnapshot } from "../../services/periodComparison.js";

const shift = (
  day: number,
  good: number | null,
  patch: Partial<ComparisonSnapshot> = {},
) => ({
  revisionId: day,
  snapshot: {
    start: new Date(Date.UTC(2026, 4, day, 6)).toISOString(),
    end: new Date(Date.UTC(2026, 4, day, 14)).toISOString(),
    job: { reference: "J", product: "Bracket", target: null },
    seconds: { running: 20000, idle: 8800, fault: 0, planned: 0, unknown: 0 },
    quantities: { total: good, good, reject: 0 },
    verified: true,
    ...patch,
  } as unknown as ComparisonSnapshot,
});

describe("completion forecast", () => {
  it("uses only verified, fully covered runs of the product after the latest process change", () => {
    const { runs, excluded, products } = comparableRuns(
      [
        shift(1, 800),
        shift(2, 800, { verified: false }),
        shift(3, 800, {
          seconds: { running: 1, idle: 0, fault: 0, planned: 0, unknown: 60 },
        } as never),
        shift(4, null),
        shift(5, 800, {
          job: { reference: "J", product: "Housing", target: null },
        } as never),
        shift(12, 960),
      ],
      "Bracket",
      new Date(Date.UTC(2026, 4, 10)),
    );
    expect(runs.map((r) => [r.revisionId, r.rate])).toEqual([[12, 120]]);
    expect(excluded).toEqual({
      unverified: 1,
      incompleteCoverage: 1,
      noGoodCount: 1,
      beforeProcessChange: 1,
      otherProduct: 1,
    });
    expect(products).toEqual(["Bracket", "Housing"]);
  });

  it("withholds the estimate with too few runs and gives a range with enough", () => {
    const runs = Array.from(
      { length: MIN_COMPARABLE_RUNS },
      (_, i) =>
        comparableRuns([shift(i + 1, 800 + i * 16)], "Bracket", null).runs[0],
    );
    expect(forecast(runs.slice(1), 500)).toMatchObject({ status: "withheld" });
    const estimate = forecast(runs, 500);
    if (estimate.status !== "estimate") throw new Error("expected an estimate");
    expect(estimate.hours.fast!).toBeLessThan(estimate.hours.median!);
    expect(estimate.hours.median!).toBeLessThan(estimate.hours.slow!);
    expect(estimate.ratePerHour.median).toBeCloseTo(
      quantile(
        runs.map((r) => r.rate),
        0.5,
      ),
    );
    // When the slowest decile produced nothing, the slow end is open.
    const stalled = [
      ...runs.slice(2),
      { ...runs[0], good: 0, rate: 0 },
      { ...runs[1], good: 0, rate: 0 },
    ];
    expect(forecast(stalled, 500)).toMatchObject({ hours: { slow: null } });
  });

  it("backtests each later run against the runs before it", () => {
    const runs = Array.from(
      { length: 14 },
      (_, i) =>
        comparableRuns([shift(i + 1, 800 + (i % 3) * 40)], "Bracket", null)
          .runs[0],
    );
    const result = backtest(runs);
    expect(result.evaluated).toBe(4);
    expect(result.intervalCoverage).toBeGreaterThan(0);
    expect(result.medianAbsErrorHours).not.toBeNull();
    expect(result.benchmarkMedianAbsErrorHours).not.toBeNull();
    expect(backtest(runs.slice(0, MIN_COMPARABLE_RUNS)).evaluated).toBe(0);
  });
});
