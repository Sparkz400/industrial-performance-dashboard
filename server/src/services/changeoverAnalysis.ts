import type {
  ChangeoverAnalysis,
  ChangeoverTransition,
  DowntimeReason,
  ProductRun,
  ProductionInterval,
} from "@performance-dashboard/shared";

export interface ObservedShift {
  id: number;
  name: string;
  runs: ProductRun[];
  breaks: { start: string; end: string }[];
  /** Shift state timeline; empty when the shift has no product transition to measure. */
  intervals: ProductionInterval[];
  reasons: DowntimeReason[];
}
export interface ChangeoverStandard {
  id: number;
  fromProduct: string;
  toProduct: string;
  expectedSeconds: number;
}

const ms = Date.parse;
const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const pair = (from: string, to: string) => JSON.stringify([from, to]);
const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b),
    mid = Math.floor(v.length / 2);
  return v.length ? (v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2) : null;
};

/**
 * A changeover runs from the last running state of the earlier product run to the first
 * running state of the next one, minus scheduled breaks. Unknown state inside it, runs
 * without observed running and transitions between shifts are listed but not measured.
 * Comparable means the same product transition on the same machine; nothing is ranked.
 */
export function measureChangeovers(
  shifts: ObservedShift[],
  standards: ChangeoverStandard[],
): Pick<ChangeoverAnalysis, "transitions" | "groups"> {
  const current = new Map<string, ChangeoverStandard>();
  for (const s of standards) {
    const key = pair(s.fromProduct, s.toProduct);
    if ((current.get(key)?.id ?? 0) < s.id) current.set(key, s);
  }
  const transitions: ChangeoverTransition[] = [];
  const base = (
    shift: ObservedShift,
    a: ProductRun,
    b: ProductRun,
  ): ChangeoverTransition => ({
    shiftId: shift.id,
    shiftName: shift.name,
    from: { product: a.product, reference: a.reference, plannedEnd: a.end },
    to: { product: b.product, reference: b.reference, plannedStart: b.start },
    status: "unobserved",
    issue: null,
    stoppedAt: null,
    resumedAt: null,
    actualSeconds: null,
    breakSeconds: 0,
    confirmedSeconds: 0,
    expectedSeconds:
      current.get(pair(a.product, b.product))?.expectedSeconds ?? null,
  });
  const changes = (a?: ProductRun, b?: ProductRun) =>
    !!a?.product && !!b?.product && a.product !== b.product;
  let previous: ProductRun | undefined;
  for (const shift of shifts) {
    const runs = [...shift.runs].sort((a, b) => ms(a.start) - ms(b.start));
    if (changes(previous, runs[0]))
      transitions.push({
        ...base(shift, previous!, runs[0]),
        status: "across-shifts",
        issue: "Spans two shifts; not measured",
      });
    previous = runs.at(-1) ?? previous;
    for (let i = 1; i < runs.length; i++)
      if (changes(runs[i - 1], runs[i]))
        transitions.push(
          measure(
            shift,
            runs[i - 1],
            runs[i],
            base(shift, runs[i - 1], runs[i]),
          ),
        );
  }
  const groups = new Map<string, ChangeoverTransition[]>();
  for (const t of transitions) {
    const key = pair(t.from.product, t.to.product);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return {
    transitions,
    groups: [...groups]
      .map(([key, list]) => {
        const observed = list.flatMap((t) =>
          t.status === "observed" ? [t.actualSeconds!] : [],
        );
        const standard = current.get(key),
          middle = median(observed);
        return {
          fromProduct: list[0].from.product,
          toProduct: list[0].to.product,
          transitions: list.length,
          observed: observed.length,
          medianActualSeconds: middle,
          expectedSeconds: standard?.expectedSeconds ?? null,
          standardId: standard?.id ?? null,
          medianDifferenceSeconds:
            middle != null && standard
              ? middle - standard.expectedSeconds
              : null,
        };
      })
      .sort(
        (a, b) =>
          a.fromProduct.localeCompare(b.fromProduct) ||
          a.toProduct.localeCompare(b.toProduct),
      ),
  };
}

function measure(
  shift: ObservedShift,
  a: ProductRun,
  b: ProductRun,
  t: ChangeoverTransition,
): ChangeoverTransition {
  const running = shift.intervals.filter((i) => i.state === "running");
  const last = running.filter((i) => ms(i.start) < ms(a.end)).at(-1);
  const first = running.find((i) => ms(i.end) > ms(b.start));
  if (!last) return { ...t, issue: "No running observed in the earlier run" };
  if (!first || ms(first.start) >= ms(b.end))
    return { ...t, issue: "No running observed in the later run" };
  if (first === last)
    return {
      ...t,
      status: "observed",
      issue: "Running continued across the product boundary; no stop observed",
      actualSeconds: 0,
    };
  const t0 = ms(last.end),
    t1 = ms(first.start);
  // Breaks never overlap each other, so subtracting each one's share is exact.
  const outsideBreaks = (from: number, to: number) =>
    overlap(from, to, t0, t1) -
    shift.breaks.reduce(
      (s, b) =>
        s +
        overlap(Math.max(from, ms(b.start)), Math.min(to, ms(b.end)), t0, t1),
      0,
    );
  const breakSeconds = (t1 - t0 - outsideBreaks(t0, t1)) / 1000;
  const replaced = new Set(shift.reasons.map((r) => r.supersedesId));
  const confirmedSeconds =
    shift.reasons
      .filter((r) => r.category === "changeover" && !replaced.has(r.id))
      .reduce((s, r) => s + outsideBreaks(ms(r.start), ms(r.end)), 0) / 1000;
  const measured = {
    ...t,
    stoppedAt: last.end,
    resumedAt: first.start,
    breakSeconds,
    confirmedSeconds,
  };
  if (
    shift.intervals.some(
      (i) =>
        i.state === "unknown" && overlap(ms(i.start), ms(i.end), t0, t1) > 0,
    )
  )
    return {
      ...measured,
      issue: "Machine state unknown during the changeover",
    };
  return {
    ...measured,
    status: "observed",
    actualSeconds: (t1 - t0) / 1000 - breakSeconds,
  };
}
