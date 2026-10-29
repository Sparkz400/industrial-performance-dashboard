import type {
  ProductionProfile,
  ProductionState,
  ProductionInterval,
  ShiftReport,
  DowntimeReason,
} from "@performance-dashboard/shared";

export interface ShiftSample {
  timestamp: Date;
  value: number | null;
  statusCode: string | null;
}
export interface TimeWindow {
  start: string;
  end: string;
}

export function stateTimeline(
  samples: ShiftSample[],
  profile: ProductionProfile,
  start: Date,
  end: Date,
): ProductionInterval[] {
  const result: ProductionInterval[] = [];
  const add = (from: number, to: number, state: ProductionState) => {
    if (to <= from) return;
    const previous = result.at(-1);
    if (previous?.state === state && Date.parse(previous.end) === from)
      previous.end = new Date(to).toISOString();
    else
      result.push({
        start: new Date(from).toISOString(),
        end: new Date(to).toISOString(),
        state,
      });
  };
  let cursor = start.getTime();
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const from = Math.max(start.getTime(), sample.timestamp.getTime());
    const to = Math.min(
      end.getTime(),
      samples[i + 1]?.timestamp.getTime() ?? end.getTime(),
      sample.timestamp.getTime() + profile.maxGapSeconds * 1000,
    );
    if (from > end.getTime()) break;
    add(cursor, Math.min(from, end.getTime()), "unknown");
    const value =
      sample.value == null
        ? null
        : sample.value * (profile.signals.state?.scale ?? 1);
    const state =
      value != null && sample.statusCode?.startsWith("Good")
        ? ((Object.entries(profile.states).find(([, values]) =>
            values.includes(value),
          )?.[0] as ProductionState | undefined) ?? "unknown")
        : "unknown";
    add(Math.max(cursor, from), to, state);
    cursor = Math.max(cursor, to);
  }
  add(cursor, end.getTime(), "unknown");
  return result;
}

export function counterDeltas(
  samples: ShiftSample[],
  profile: ProductionProfile,
  scale: number,
  start: Date,
  end: Date,
): { count: number | null; complete: boolean } {
  let count = 0;
  let usable = 0;
  let complete =
    samples.length >= 2 &&
    samples[0].timestamp.getTime() === start.getTime() &&
    samples.at(-1)!.timestamp.getTime() === end.getTime();
  let previous: ShiftSample | undefined;
  for (const sample of samples) {
    if (
      sample.value == null ||
      sample.value < 0 ||
      (profile.counterPolicy === "rollover" &&
        (!profile.counterModulus || sample.value >= profile.counterModulus)) ||
      !sample.statusCode?.startsWith("Good")
    ) {
      previous = undefined;
      complete = false;
      continue;
    }
    if (previous && previous.timestamp >= start && sample.timestamp <= end) {
      const gap = sample.timestamp.getTime() - previous.timestamp.getTime();
      if (gap <= 0 || gap > profile.maxGapSeconds * 1000) complete = false;
      else if (sample.value >= previous.value!) {
        count += (sample.value - previous.value!) * scale;
        usable++;
      } else if (
        profile.counterPolicy === "rollover" &&
        profile.counterModulus &&
        previous.value! >= profile.counterModulus * 0.9 &&
        sample.value <= profile.counterModulus * 0.1
      ) {
        count +=
          (profile.counterModulus - previous.value! + sample.value) * scale;
        usable++;
      } else if (profile.counterPolicy === "reset-to-zero") {
        count += sample.value * scale;
        usable++;
      } else complete = false;
    }
    previous = sample;
  }
  return { count: usable ? count : null, complete };
}

export interface ManualStateDeclaration {
  entryId: number;
  start: string;
  end: string;
  state: Exclude<ProductionState, "unknown">;
}

/**
 * Reviewed manual declarations fill only unknown machine time. An observed state is kept
 * where a declaration contradicts it, and declarations that disagree leave their overlap
 * unknown. Returns the merged timeline and the seconds each rule applied to.
 */
export function applyManualStates(
  intervals: ProductionInterval[],
  manual: ManualStateDeclaration[],
  start: Date,
  end: Date,
) {
  const result = {
    intervals: [] as ProductionInterval[],
    manualSeconds: 0,
    conflictSeconds: 0,
    contradictedSeconds: 0,
  };
  if (!manual.length) return { ...result, intervals };
  const clip = (t: number) =>
    Math.min(end.getTime(), Math.max(start.getTime(), t));
  const points = [
    ...new Set([
      start.getTime(),
      end.getTime(),
      ...intervals.flatMap((i) => [Date.parse(i.start), Date.parse(i.end)]),
      ...manual.flatMap((m) => [
        clip(Date.parse(m.start)),
        clip(Date.parse(m.end)),
      ]),
    ]),
  ].sort((a, b) => a - b);
  for (let k = 0; k < points.length - 1; k++) {
    const from = points[k],
      to = points[k + 1],
      seconds = (to - from) / 1000;
    // shortcut: scans every interval per boundary (quadratic); fine for one shift's
    // timeline, index the intervals if a report ever spans far more state changes.
    const covers = (i: { start: string; end: string }) =>
      Date.parse(i.start) <= from && Date.parse(i.end) >= to;
    const observed = intervals.find(covers)?.state ?? "unknown";
    const declared = new Set(manual.filter(covers).map((m) => m.state));
    let state: ProductionState = observed,
      source: "manual" | undefined;
    if (observed !== "unknown") {
      if ([...declared].some((s) => s !== observed))
        result.contradictedSeconds += seconds;
    } else if (declared.size === 1) {
      state = [...declared][0];
      source = "manual";
      result.manualSeconds += seconds;
    } else if (declared.size > 1) result.conflictSeconds += seconds;
    const previous = result.intervals.at(-1);
    if (
      previous?.state === state &&
      previous.source === source &&
      Date.parse(previous.end) === from
    )
      previous.end = new Date(to).toISOString();
    else
      result.intervals.push({
        start: new Date(from).toISOString(),
        end: new Date(to).toISOString(),
        state,
        ...(source ? { source } : {}),
      });
  }
  return result;
}

const minutes = (seconds: number) => `${(seconds / 60).toFixed(1)} min`;

export function calculateShift(input: {
  id: number;
  machineId: number;
  name: string;
  timezone: string;
  start: Date;
  end: Date;
  profile: ProductionProfile;
  job: ShiftReport["job"];
  breaks: TimeWindow[];
  reasons: DowntimeReason[];
  samples: Record<string, ShiftSample[]>;
  evidence: ShiftReport["evidence"];
  declaration?: ShiftReport["declaration"];
  manualStates?: ManualStateDeclaration[];
}): ShiftReport {
  const { profile, start, end } = input;
  const state = profile.signals.state;
  const manual = applyManualStates(
    stateTimeline(
      state ? (input.samples[state.nodeKey] ?? []) : [],
      profile,
      start,
      end,
    ),
    input.manualStates ?? [],
    start,
    end,
  );
  const intervals = manual.intervals;
  const seconds = { running: 0, idle: 0, fault: 0, planned: 0, unknown: 0 };
  const replaced = new Set(input.reasons.map((reason) => reason.supersedesId));
  const reasons = input.reasons.filter((reason) => !replaced.has(reason.id));
  const losses = new Map<string, number>();
  let plannedSeconds = 0;
  let plannedRunningSeconds = 0;
  const boundaries = [
    ...new Set([
      start.getTime(),
      end.getTime(),
      ...intervals.flatMap((i) => [Date.parse(i.start), Date.parse(i.end)]),
      ...input.breaks.flatMap((i) => [Date.parse(i.start), Date.parse(i.end)]),
      ...reasons.flatMap((i) => [Date.parse(i.start), Date.parse(i.end)]),
    ]),
  ]
    .filter((time) => time >= start.getTime() && time <= end.getTime())
    .sort((a, b) => a - b);
  let intervalIndex = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i],
      to = boundaries[i + 1],
      duration = (to - from) / 1000;
    while (
      intervalIndex < intervals.length - 1 &&
      Date.parse(intervals[intervalIndex].end) <= from
    )
      intervalIndex++;
    const state = intervals[intervalIndex]?.state ?? "unknown";
    seconds[state] += duration;
    const reason = reasons.find(
      (r) => Date.parse(r.start) <= from && Date.parse(r.end) >= to,
    );
    const planned =
      input.breaks.some(
        (b) => Date.parse(b.start) <= from && Date.parse(b.end) >= to,
      ) ||
      state === "planned" ||
      (reason?.category === "planned" &&
        state !== "unknown" &&
        state !== "running");
    if (planned) {
      plannedSeconds += duration;
      if (state === "running") plannedRunningSeconds += duration;
    }
    if (state !== "running") {
      const label =
        state === "unknown"
          ? "Unknown data"
          : (reason?.reason ??
            (planned ? "Planned break" : "Unclassified stop"));
      losses.set(label, (losses.get(label) ?? 0) + duration);
    }
  }
  const issues: string[] = [];
  if (seconds.unknown > 0)
    issues.push(
      "State coverage has unknown intervals; these are not counted as downtime.",
    );
  if (manual.manualSeconds > 0)
    issues.push(
      `Reviewed manual state declarations fill ${minutes(manual.manualSeconds)} of unknown machine state; they are declarations, not measurements.`,
    );
  if (manual.conflictSeconds > 0)
    issues.push(
      `Reviewed manual state declarations disagree for ${minutes(manual.conflictSeconds)}; that time stays unknown.`,
    );
  if (manual.contradictedSeconds > 0)
    issues.push(
      `Manual state declarations differ from the observed state for ${minutes(manual.contradictedSeconds)}; the observed state is kept.`,
    );
  if (losses.has("Unclassified stop"))
    issues.push("Some stops still need an operator reason.");
  const quantities: ShiftReport["quantities"] = {
    total: null,
    good: null,
    reject: null,
  };
  let measuredComplete = true;
  for (const key of ["total", "good", "reject"] as const) {
    const signal = profile.signals[key];
    if (!signal) {
      measuredComplete = false;
      issues.push(`Missing ${key} counter mapping.`);
      continue;
    }
    const result = counterDeltas(
      input.samples[signal.nodeKey] ?? [],
      profile,
      signal.scale,
      start,
      end,
    );
    quantities[key] = result.count;
    if (!result.complete) {
      measuredComplete = false;
      issues.push(
        `${key} counter has gaps, a decrease, or unsampled shift boundaries; quantity is only observed deltas.`,
      );
    }
  }
  // A reviewed declaration stands in only for incomplete counters and never verifies a shift.
  const declaration = input.declaration ?? null;
  let quantitySource: ShiftReport["quantitySource"] = "measured";
  if (declaration) {
    const declared = {
      total: declaration.total,
      good: declaration.good,
      reject: declaration.reject,
    };
    if (!measuredComplete) {
      Object.assign(quantities, declared);
      quantitySource = "declaration";
      issues.push(
        `Quantities come from reviewed manual declaration #${declaration.entryId} because machine counters are incomplete.`,
      );
    } else if (
      (["total", "good", "reject"] as const).some(
        (key) => quantities[key] !== declared[key],
      )
    )
      issues.push(
        `Reviewed manual declaration #${declaration.entryId} differs from measured counts.`,
      );
  }
  const scheduledSeconds =
    (end.getTime() - start.getTime()) / 1000 - plannedSeconds;
  const runningSeconds = seconds.running - plannedRunningSeconds;
  const availability =
    scheduledSeconds > 0 && seconds.unknown === 0
      ? runningSeconds / scheduledSeconds
      : null;
  // Counter deltas cannot assign production inside an excluded break to scheduled time.
  if (plannedRunningSeconds > 0)
    issues.push(
      "Running overlaps an excluded break; revise the schedule before calculating performance and OEE.",
    );
  const performance =
    plannedRunningSeconds === 0 &&
    runningSeconds > 0 &&
    quantities.total != null
      ? (quantities.total * profile.idealCycleMs) / (runningSeconds * 1000)
      : null;
  const quality =
    quantities.total != null &&
    quantities.total > 0 &&
    quantities.good != null &&
    quantities.reject != null
      ? quantities.good / quantities.total
      : null;
  if (
    quantities.total != null &&
    quantities.good != null &&
    quantities.reject != null &&
    quantities.total !== quantities.good + quantities.reject
  )
    issues.push("Total differs from good plus reject quantities.");
  if (
    [availability, performance, quality].some(
      (value) => value != null && value > 1,
    )
  )
    issues.push(
      "A factor exceeds 100%; check mapping, cycle standard and counters.",
    );
  if (Date.now() < end.getTime()) issues.push("Shift has not ended.");
  if (!input.evidence)
    issues.push("Independent reconciliation has not been recorded.");
  else if (
    (["total", "good", "reject"] as const).some(
      (key) => quantities[key] !== input.evidence![key],
    )
  )
    issues.push("Independent counts do not match observed quantities.");
  return {
    revision: "shift-v1",
    id: input.id,
    machineId: input.machineId,
    name: input.name,
    timezone: input.timezone,
    start: start.toISOString(),
    end: end.toISOString(),
    generatedAt: new Date().toISOString(),
    profile,
    job: input.job,
    intervals,
    reasons: input.reasons,
    seconds,
    scheduledSeconds,
    plannedSeconds,
    observedSeconds: (end.getTime() - start.getTime()) / 1000 - seconds.unknown,
    quantities,
    quantitySource,
    declaration,
    stateSource: !manual.manualSeconds
      ? "measured"
      : manual.manualSeconds >=
          (end.getTime() - start.getTime()) / 1000 - seconds.unknown
        ? "manual"
        : "mixed",
    manualStateSeconds: manual.manualSeconds,
    oee: {
      availability,
      performance,
      quality,
      overall:
        availability != null && performance != null && quality != null
          ? availability * performance * quality
          : null,
    },
    losses: [...losses]
      .map(([reason, seconds]) => ({ reason, seconds }))
      .sort((a, b) => b.seconds - a.seconds),
    issues,
    evidence: input.evidence,
    verified: issues.length === 0,
  };
}
