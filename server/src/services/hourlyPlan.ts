export interface PlanSegment {
  start: string;
  end: string;
  /** Parts planned for the whole segment; when null the ideal rate is the plan. */
  target: number | null;
  idealCycleMs: number;
}
export interface Window {
  start: string;
  end: string;
}

const overlap = (a: Window, b: Window) =>
  Math.max(
    0,
    Math.min(Date.parse(a.end), Date.parse(b.end)) -
      Math.max(Date.parse(a.start), Date.parse(b.start)),
  ) / 1000;

/** Seconds of `window` outside scheduled breaks (breaks do not overlap one another). */
export function availableSeconds(window: Window, breaks: Window[]) {
  return (
    overlap(window, window) - breaks.reduce((s, b) => s + overlap(window, b), 0)
  );
}

/** Hour windows from the shift start (the last one may be shorter). */
export function hourWindows(start: string, end: string): Window[] {
  const windows: Window[] = [];
  for (let at = Date.parse(start); at < Date.parse(end); at += 3_600_000)
    windows.push({
      start: new Date(at).toISOString(),
      end: new Date(Math.min(at + 3_600_000, Date.parse(end))).toISOString(),
    });
  return windows;
}

/**
 * Parts planned in `window`: each segment's target spread evenly over its non-break time,
 * or its ideal rate when it has no target. Breaks plan nothing.
 */
export function plannedParts(
  window: Window,
  segments: PlanSegment[],
  breaks: Window[],
) {
  let parts = 0;
  for (const segment of segments) {
    const part: Window = {
      start: new Date(
        Math.max(Date.parse(window.start), Date.parse(segment.start)),
      ).toISOString(),
      end: new Date(
        Math.min(Date.parse(window.end), Date.parse(segment.end)),
      ).toISOString(),
    };
    if (Date.parse(part.end) <= Date.parse(part.start)) continue;
    const seconds = availableSeconds(part, breaks);
    if (segment.target != null) {
      const total = availableSeconds(segment, breaks);
      parts += total > 0 ? (segment.target * seconds) / total : 0;
    } else if (segment.idealCycleMs > 0)
      parts += (seconds * 1000) / segment.idealCycleMs;
  }
  return parts;
}
