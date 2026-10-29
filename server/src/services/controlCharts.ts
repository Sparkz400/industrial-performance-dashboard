// Shewhart control charts for declared data assumptions (Montgomery, Introduction to
// Statistical Quality Control, Appendix VI). Limits come from an approved reference
// period, never from the window being judged.

export type ChartType = "individuals" | "xbar-r";

/** Subgroup-size constants for X̄-R charts, n = 2..10. */
const CONSTANTS: Record<
  number,
  { A2: number; D3: number; D4: number; d2: number }
> = {
  2: { A2: 1.88, D3: 0, D4: 3.267, d2: 1.128 },
  3: { A2: 1.023, D3: 0, D4: 2.574, d2: 1.693 },
  4: { A2: 0.729, D3: 0, D4: 2.282, d2: 2.059 },
  5: { A2: 0.577, D3: 0, D4: 2.114, d2: 2.326 },
  6: { A2: 0.483, D3: 0, D4: 2.004, d2: 2.534 },
  7: { A2: 0.419, D3: 0.076, D4: 1.924, d2: 2.704 },
  8: { A2: 0.373, D3: 0.136, D4: 1.864, d2: 2.847 },
  9: { A2: 0.337, D3: 0.184, D4: 1.816, d2: 2.97 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777, d2: 3.078 },
};
// Phase-I guidance: limits from fewer points than this are too uncertain to use.
export const MIN_REFERENCE_POINTS = 20;

export interface Limits {
  center: number;
  ucl: number;
  lcl: number;
}

/** Consecutive good readings in groups of n; a missing reading ends the current group. */
export function subgroups<T extends { value: number | null }>(
  readings: T[],
  n: number,
) {
  const groups: T[][] = [];
  let current: T[] = [];
  for (const reading of readings) {
    if (reading.value == null || !Number.isFinite(reading.value)) {
      current = [];
      continue;
    }
    current.push(reading);
    if (current.length === n) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;

/** Limits for the declared chart from the approved reference readings. */
export function referenceLimits(
  type: ChartType,
  reference: number[],
  n = 1,
): { primary: Limits; secondary: Limits; points: number } {
  if (type === "individuals") {
    if (reference.length < MIN_REFERENCE_POINTS + 1)
      throw new Error(
        `An I-MR chart needs at least ${MIN_REFERENCE_POINTS + 1} reference readings`,
      );
    const ranges = reference.slice(1).map((v, i) => Math.abs(v - reference[i]));
    const mr = mean(ranges),
      center = mean(reference);
    // 3/d2 with d2 = 1.128 for moving ranges of two (2.66), and D4 = 3.267.
    return {
      primary: { center, ucl: center + 2.66 * mr, lcl: center - 2.66 * mr },
      secondary: { center: mr, ucl: 3.267 * mr, lcl: 0 },
      points: reference.length,
    };
  }
  const k = CONSTANTS[n];
  if (!k) throw new Error("Subgroup size must be between 2 and 10");
  const groups = subgroups(
    reference.map((value) => ({ value })),
    n,
  ).map((g) => g.map((r) => r.value));
  if (groups.length < MIN_REFERENCE_POINTS)
    throw new Error(
      `An X̄-R chart needs at least ${MIN_REFERENCE_POINTS} reference subgroups of ${n}`,
    );
  const means = groups.map(mean),
    ranges = groups.map((g) => Math.max(...g) - Math.min(...g));
  const center = mean(means),
    r = mean(ranges);
  return {
    primary: { center, ucl: center + k.A2 * r, lcl: center - k.A2 * r },
    secondary: { center: r, ucl: k.D4 * r, lcl: k.D3 * r },
    points: groups.length,
  };
}

/** Points of the window on the declared chart, each flagged against the reference limits. */
export function chartPoints(
  type: ChartType,
  readings: { at: string; value: number | null }[],
  limits: { primary: Limits; secondary: Limits },
  n = 1,
) {
  const outside = (value: number, l: Limits) => value > l.ucl || value < l.lcl;
  if (type === "individuals") {
    const points = [];
    let previous: number | null = null;
    for (const reading of readings) {
      if (reading.value == null || !Number.isFinite(reading.value)) {
        previous = null; // a missing reading leaves the next moving range unknown
        continue;
      }
      const range =
        previous == null ? null : Math.abs(reading.value - previous);
      points.push({
        at: reading.at,
        value: reading.value,
        range,
        outOfControl:
          outside(reading.value, limits.primary) ||
          (range != null && outside(range, limits.secondary)),
      });
      previous = reading.value;
    }
    return points;
  }
  return subgroups(readings, n).map((group) => {
    const values = group.map((r) => r.value as number);
    const value = mean(values),
      range = Math.max(...values) - Math.min(...values);
    return {
      at: group.at(-1)!.at,
      value,
      range,
      outOfControl:
        outside(value, limits.primary) || outside(range, limits.secondary),
    };
  });
}
