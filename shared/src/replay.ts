import type { SignalMetadata } from "./socket-events.js";

export interface ReplaySample {
  id: number;
  at: string;
  sourceAt: string | null;
  receivedAt: string | null;
  value: number | null;
  raw: number | string | boolean | null;
  rawTruncated: boolean;
  quality: string | null;
  identity: SignalMetadata | null;
}
export interface ReplayEvent {
  id: string;
  at: string;
  clock: "received" | "recorded";
  sourceAt: string | null;
  kind: "alarm" | "acknowledgment" | "recovery" | "operator" | "classification";
  text: string;
  actorId: number | null;
  relatedId: number;
  details: Record<string, unknown>;
}
export interface IncidentReplay {
  revision: "incident-replay-v1";
  machine: { id: number; name: string };
  start: string;
  end: string;
  generatedAt: string;
  maxGapSeconds: number;
  signals: { key: string; samples: ReplaySample[]; truncated: boolean }[];
  events: ReplayEvent[];
  truncated: { alarms: boolean; operator: boolean; classifications: boolean };
}

/** Last recorded observation at the cursor; never interpolate or carry it across a gap. */
export function replayObservation(
  samples: ReplaySample[],
  cursor: number,
  maxGapSeconds: number,
) {
  let previous: ReplaySample | undefined;
  for (let index = samples.length - 1; index >= 0; index--) {
    if (Date.parse(samples[index].at) <= cursor) {
      previous = samples[index];
      break;
    }
  }
  if (!previous)
    return { sample: null, known: false, reason: "No observation" };
  if (cursor - Date.parse(previous.at) > maxGapSeconds * 1000)
    return { sample: previous, known: false, reason: "Observation gap" };
  if (!previous.quality?.startsWith("Good"))
    return {
      sample: previous,
      known: false,
      reason: previous.quality || "Unknown quality",
    };
  return {
    sample: previous,
    known: previous.raw !== null || previous.value !== null,
    reason: "Recorded observation",
  };
}

export function replayPoints(
  samples: ReplaySample[],
  start: string,
  end: string,
  maxGapSeconds: number,
) {
  const points: { x: string; y: number | null }[] = [{ x: start, y: null }];
  let previous: ReplaySample | undefined;
  for (const sample of samples) {
    if (
      previous &&
      Date.parse(sample.at) > Date.parse(previous.at) &&
      (Date.parse(sample.at) - Date.parse(previous.at) > maxGapSeconds * 1000 ||
        previous.identity?.namespaceUri !== sample.identity?.namespaceUri ||
        previous.identity?.identifier !== sample.identity?.identifier ||
        previous.identity?.mappingRevision !== sample.identity?.mappingRevision)
    )
      points.push({
        x: new Date(
          (Date.parse(previous.at) + Date.parse(sample.at)) / 2,
        ).toISOString(),
        y: null,
      });
    const point = {
      x: sample.at,
      y: sample.quality?.startsWith("Good") ? sample.value : null,
    };
    if (points[points.length - 1]?.x === point.x)
      points[points.length - 1] = point;
    else points.push(point);
    previous = sample;
  }
  if (points[points.length - 1]?.x !== end) points.push({ x: end, y: null });
  return points;
}
