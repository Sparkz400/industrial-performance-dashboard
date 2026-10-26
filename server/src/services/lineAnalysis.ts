export interface LineSample {
  timestamp: string;
  value: number | null;
  status_code: string | null;
}
export interface LineMachine {
  machineId: number;
  stateKey: string;
  cycleKey: string | null;
  outputKey: string | null;
  states: Record<
    "running" | "idle" | "fault" | "blocked" | "starved",
    number[]
  >;
}
export interface LineConfig {
  name: string;
  maxGapSeconds: number;
  microstopSeconds: number;
  machines: LineMachine[];
  buffers: {
    from: number;
    to: number;
    machineId: number;
    nodeKey: string;
    capacity: number;
  }[];
}
const good = (s: LineSample) =>
  s.value != null &&
  Number.isFinite(s.value) &&
  s.status_code?.startsWith("Good");
export function lineTimeline(
  samples: LineSample[],
  mapping: LineMachine["states"],
  start: number,
  end: number,
  gap: number,
) {
  const intervals: { start: number; end: number; state: string }[] = [];
  const add = (a: number, b: number, state: string) => {
    if (b <= a) return;
    const last = intervals.at(-1);
    if (last?.state === state && last.end === a) last.end = b;
    else intervals.push({ start: a, end: b, state });
  };
  let cursor = start;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i],
      at = Date.parse(s.timestamp);
    if (at >= end) break;
    const next = Math.min(
      end,
      Date.parse(samples[i + 1]?.timestamp ?? new Date(end).toISOString()),
      at + gap,
    );
    if (next <= cursor) continue;
    add(cursor, Math.max(cursor, at), "unknown");
    const state = good(s)
      ? (Object.entries(mapping).find(([, v]) => v.includes(s.value!))?.[0] ??
        "unknown")
      : "unknown";
    add(Math.max(cursor, at), next, state);
    cursor = next;
  }
  add(cursor, end, "unknown");
  return intervals;
}
export function analyzeLine(
  config: LineConfig,
  data: Record<string, LineSample[]>,
  start: number,
  end: number,
  target: number,
) {
  const get = (id: number, key: string | null) =>
    key ? (data[`${id}:${key}`] ?? []) : [];
  const span = (end - start) / 1000;
  const machines = config.machines.map((m) => {
    const timeline = lineTimeline(
      get(m.machineId, m.stateKey),
      m.states,
      start,
      end,
      config.maxGapSeconds * 1000,
    );
    const seconds: Record<string, number> = {
      running: 0,
      idle: 0,
      fault: 0,
      blocked: 0,
      starved: 0,
      unknown: 0,
    };
    for (const i of timeline) seconds[i.state] += (i.end - i.start) / 1000;
    const stopTimeline = timeline.reduce<typeof timeline>(
      (segments, interval) => {
        const state = ["idle", "fault", "blocked", "starved"].includes(
          interval.state,
        )
          ? "stopped"
          : interval.state;
        const last = segments.at(-1);
        if (last?.state === state) last.end = interval.end;
        else segments.push({ ...interval, state });
        return segments;
      },
      [],
    );
    const stops = stopTimeline.filter(
      (i, index) =>
        i.state === "stopped" &&
        (i.end - i.start) / 1000 <= config.microstopSeconds &&
        stopTimeline[index - 1]?.state === "running" &&
        stopTimeline[index + 1]?.state === "running",
    );
    const rawCycles = get(m.machineId, m.cycleKey).filter(
      (s) => Date.parse(s.timestamp) >= start && Date.parse(s.timestamp) < end,
    );
    const cycles = rawCycles
      .filter((s) => good(s) && s.value! > 0)
      .map((s) => s.value!)
      .sort((a, b) => a - b);
    const percentile = (p: number) =>
      cycles.length ? cycles[Math.ceil(cycles.length * p) - 1] : null;
    let observedOutput = 0,
      pairs = 0,
      resets = 0;
    const counts = get(m.machineId, m.outputKey).filter(
      (s) => Date.parse(s.timestamp) >= start && Date.parse(s.timestamp) <= end,
    );
    for (let i = 1; i < counts.length; i++) {
      const a = counts[i - 1],
        b = counts[i],
        elapsed = Date.parse(b.timestamp) - Date.parse(a.timestamp);
      if (
        !good(a) ||
        !good(b) ||
        a.value! < 0 ||
        b.value! < 0 ||
        elapsed <= 0 ||
        elapsed > config.maxGapSeconds * 1000
      )
        continue;
      if (b.value! < a.value!) {
        resets++;
        continue;
      }
      observedOutput += b.value! - a.value!;
      pairs++;
    }
    const complete =
      counts.length >= 2 &&
      Date.parse(counts[0].timestamp) === start &&
      Date.parse(counts.at(-1)!.timestamp) === end &&
      pairs === counts.length - 1 &&
      !resets;
    return {
      machineId: m.machineId,
      seconds,
      coverage: 1 - seconds.unknown / span,
      timeline,
      microstops: {
        count: stops.length,
        seconds: stops.reduce((n, s) => n + (s.end - s.start) / 1000, 0),
      },
      cycles: {
        count: cycles.length,
        excluded: rawCycles.length - cycles.length,
        p50: percentile(0.5),
        p90: percentile(0.9),
        p95: percentile(0.95),
        unit: "ms",
      },
      output: { observed: pairs ? observedOutput : null, complete, resets },
      lossSeconds: seconds.idle + seconds.fault,
    };
  });
  const buffers = config.buffers.map((b) => {
    const samples = get(b.machineId, b.nodeKey).filter(
      (s) => Date.parse(s.timestamp) >= start && Date.parse(s.timestamp) < end,
    );
    const values = samples
      .filter((s) => good(s) && s.value! >= 0 && s.value! <= b.capacity)
      .map((s) => s.value!);
    return {
      ...b,
      samples: values.length,
      excluded: samples.length - values.length,
      emptyReadings: values.filter((v) => v === 0).length,
      fullReadings: values.filter((v) => v === b.capacity).length,
    };
  });
  const candidates = machines
    .filter(
      (m) => m.coverage >= 0.8 && (m.lossSeconds > 0 || m.cycles.count >= 10),
    )
    .map((m) => ({
      machineId: m.machineId,
      lossSeconds: m.lossSeconds,
      cycleP50Ms: m.cycles.count >= 10 ? m.cycles.p50 : null,
      cycleReadings: m.cycles.count,
      upstreamBlockedSeconds: machines
        .filter((other) =>
          config.buffers.some(
            (b) => b.to === m.machineId && b.from === other.machineId,
          ),
        )
        .reduce((n, other) => n + other.seconds.blocked, 0),
      downstreamStarvedSeconds: machines
        .filter((other) =>
          config.buffers.some(
            (b) => b.from === m.machineId && b.to === other.machineId,
          ),
        )
        .reduce((n, other) => n + other.seconds.starved, 0),
      coverage: m.coverage,
    }))
    .sort(
      (a, b) =>
        b.lossSeconds - a.lossSeconds ||
        (b.cycleP50Ms ?? 0) - (a.cycleP50Ms ?? 0),
    );
  const terminal = config.machines.filter(
    (m) => !config.buffers.some((b) => b.from === m.machineId),
  );
  const output =
    terminal.length === 1
      ? machines.find((m) => m.machineId === terminal[0].machineId)!.output
      : null;
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    target,
    observedOutput: output?.observed ?? null,
    targetShortfall: output?.complete
      ? Math.max(0, target - output.observed!)
      : null,
    machines,
    buffers,
    candidates,
    uncertainty: [
      "Candidates rank observed idle/fault time, then median cycle duration when at least 10 cycles are observed. Adjacent blocked/starved totals support investigation, not causal proof; cycle comparisons require equivalent work per cycle.",
      "Buffer counts are sampled observations, not time occupancy. Cycle tag must emit one duration per completed cycle.",
      ...(!output?.complete
        ? [
            "Line output is incomplete or no unique terminal machine exists; target shortfall is unknown.",
          ]
        : []),
      ...(machines.some((m) => m.coverage < 0.8)
        ? [
            "Some machines have less than 80% state coverage; their bottleneck rank is withheld.",
          ]
        : []),
    ],
  };
}
