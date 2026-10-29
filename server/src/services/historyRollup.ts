import type { ProductionProfile } from "@performance-dashboard/shared";

/** A reading about to be removed by retention, with the reading that follows it. */
export interface RemovedReading {
  machineId: number;
  nodeKey: string;
  ts: Date;
  value: number | null;
  statusCode: string | null;
  next: { ts: Date; value: number | null; statusCode: string | null } | null;
  /** Production profile in force at the reading; null when none was commissioned. */
  profile: ProductionProfile | null;
}

const HOUR = 3600000;
const hourOf = (ms: number) =>
  new Date(Math.floor(ms / HOUR) * HOUR).toISOString();

/**
 * State seconds and counter increments that a summary must keep once raw readings go.
 * Each reading owns the interval or counter pair that starts at it, so readings that
 * stay stored never double-count. Rules match the shift report (stateTimeline,
 * counterDeltas): states hold until the next reading or maxGapSeconds; counters use the
 * profile's reset/rollover policy; bad, missing or out-of-gap data stays unknown.
 */
export function rollupRemoved(readings: RemovedReading[]) {
  const states = new Map<string, number>();
  const counters = new Map<
    string,
    { increment: number; pairs: number; unknownPairs: number }
  >();
  for (const r of readings) {
    const p = r.profile;
    if (!p) continue;
    const gapMs = p.maxGapSeconds * 1000;
    if (p.signals.state && r.nodeKey === p.signals.state.nodeKey) {
      const value = r.value == null ? null : r.value * p.signals.state.scale;
      const state =
        value != null && r.statusCode?.startsWith("Good")
          ? Object.entries(p.states).find(([, values]) =>
              values.includes(value),
            )?.[0]
          : undefined;
      if (!state) continue; // unknown time is the hour's remainder, never stored as a state
      const from = r.ts.getTime();
      const to = Math.min(r.next?.ts.getTime() ?? Infinity, from + gapMs);
      for (let at = from; at < to; at = Math.floor(at / HOUR) * HOUR + HOUR) {
        const end = Math.min(to, Math.floor(at / HOUR) * HOUR + HOUR);
        const key = JSON.stringify([r.machineId, r.nodeKey, hourOf(at), state]);
        states.set(key, (states.get(key) ?? 0) + (end - at) / 1000);
      }
      continue;
    }
    const signal = (["total", "good", "reject"] as const)
      .map((role) => p.signals[role])
      .find((s) => s?.nodeKey === r.nodeKey);
    if (!signal || !r.next) continue;
    // Counted when the later reading observed it.
    const key = JSON.stringify([
      r.machineId,
      r.nodeKey,
      hourOf(r.next.ts.getTime()),
    ]);
    const entry = counters.get(key) ?? {
      increment: 0,
      pairs: 0,
      unknownPairs: 0,
    };
    counters.set(key, entry);
    const usable = (v: number | null, status: string | null) =>
      v != null &&
      v >= 0 &&
      !!status?.startsWith("Good") &&
      !(
        p.counterPolicy === "rollover" &&
        (!p.counterModulus || v >= p.counterModulus)
      );
    const gap = r.next.ts.getTime() - r.ts.getTime();
    if (
      !usable(r.value, r.statusCode) ||
      !usable(r.next.value, r.next.statusCode) ||
      gap <= 0 ||
      gap > gapMs
    ) {
      entry.unknownPairs++;
      continue;
    }
    const [a, b] = [r.value!, r.next.value!];
    let delta: number | null = null;
    if (b >= a) delta = b - a;
    else if (
      p.counterPolicy === "rollover" &&
      p.counterModulus &&
      a >= p.counterModulus * 0.9 &&
      b <= p.counterModulus * 0.1
    )
      delta = p.counterModulus - a + b;
    else if (p.counterPolicy === "reset-to-zero") delta = b;
    if (delta == null) entry.unknownPairs++;
    else {
      entry.increment += delta * signal.scale;
      entry.pairs++;
    }
  }
  return {
    states: [...states].map(([key, seconds]) => {
      const [machineId, nodeKey, bucket, state] = JSON.parse(key);
      return { machineId, nodeKey, bucket, state: state as string, seconds };
    }),
    counters: [...counters].map(([key, value]) => {
      const [machineId, nodeKey, bucket] = JSON.parse(key);
      return { machineId, nodeKey, bucket, ...value };
    }),
  };
}
