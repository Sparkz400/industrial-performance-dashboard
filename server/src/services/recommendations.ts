import type { ComparisonSnapshot } from "./periodComparison.js";

// X06: at most three explicit rules over measured evidence. Each recommendation names the
// revisions or action it rests on and its assumptions; people accept or dismiss it.
export const RECENT_REVISIONS = 5;
export const UNCLASSIFIED_SHARE = 0.2;
export const REPEATED_TOP_LOSS = 3;
const NOT_A_STOP_REASON = new Set([
  "Unclassified stop",
  "Planned break",
  "Unknown data",
]);

export interface Recommendation {
  key: string;
  rule: "classify-stops" | "escalate-recurrence" | "address-top-loss";
  title: string;
  detail: string;
  evidence: Record<string, unknown> & { revisionIds?: number[] };
  assumptions: string[];
}

export function recommend(input: {
  revisions: { revisionId: number; snapshot: ComparisonSnapshot }[];
  maintenance: {
    id: number;
    outcome: string;
    rule_name: string | null;
    repeated_alarms: number;
  }[];
  improvements: { id: number; implementedAt: Date }[];
}): Recommendation[] {
  const recent = input.revisions
    .filter((r) => r.snapshot.verified)
    .slice(-RECENT_REVISIONS);
  const result: Recommendation[] = [];
  const stopSeconds = (snapshot: ComparisonSnapshot) =>
    (snapshot.losses ?? []).filter(
      (loss) =>
        loss.reason !== "Planned break" && loss.reason !== "Unknown data",
    );

  // 1. Unclassified stops dominate: the ranked list cannot say what to fix yet.
  let unclassified = 0,
    stops = 0;
  for (const { snapshot } of recent)
    for (const loss of stopSeconds(snapshot)) {
      stops += loss.seconds;
      if (loss.reason === "Unclassified stop") unclassified += loss.seconds;
    }
  if (stops > 0 && unclassified / stops > UNCLASSIFIED_SHARE) {
    const share = unclassified / stops;
    result.push({
      key: `classify-stops:${recent.at(-1)!.revisionId}`,
      rule: "classify-stops",
      title: "Classify stops before choosing an improvement",
      detail: `${Math.round(share * 100)} % of measured stop time in the last ${recent.length} verified shift reports has no reason.`,
      evidence: {
        revisionIds: recent.map((r) => r.revisionId),
        unclassifiedSeconds: unclassified,
        stopSeconds: stops,
        share,
      },
      assumptions: [
        `Threshold: more than ${UNCLASSIFIED_SHARE * 100} % unclassified stop time`,
        "Planned breaks and unknown data are not stops",
        "Only verified saved revisions are used",
      ],
    });
  }

  // 2. A completed action did not hold: the same alarm rule fired after the service.
  for (const action of input.maintenance.filter(
    (a) => a.outcome === "recurred",
  ))
    result.push({
      key: `escalate-recurrence:${action.id}`,
      rule: "escalate-recurrence",
      title: `Escalate: "${action.rule_name ?? "the alarm"}" recurred after a completed action`,
      detail: `Alarm action ${action.id} was completed with a service record, and the same alarm fired ${action.repeated_alarms} time(s) since the action was opened.`,
      evidence: {
        maintenanceActionId: action.id,
        repeatedAlarms: action.repeated_alarms,
      },
      assumptions: [
        "Recurrence means the same alarm rule (or health key) on this machine after the service record",
      ],
    });

  // 3. The same classified reason tops the losses repeatedly with no improvement action since.
  const tops = recent
    .map(({ revisionId, snapshot }) => {
      const top = stopSeconds(snapshot)
        .filter(
          (loss) => !NOT_A_STOP_REASON.has(loss.reason) && loss.seconds > 0,
        )
        .sort((a, b) => b.seconds - a.seconds)[0];
      return top
        ? {
            revisionId,
            start: snapshot.start,
            reason: top.reason,
            seconds: top.seconds,
          }
        : null;
    })
    .filter((top): top is NonNullable<typeof top> => top !== null);
  const counts = new Map<string, typeof tops>();
  for (const top of tops)
    counts.set(top.reason, [...(counts.get(top.reason) ?? []), top]);
  for (const [reason, entries] of counts) {
    if (entries.length < REPEATED_TOP_LOSS) continue;
    const since = Date.parse(entries[0].start);
    if (
      input.improvements.some(
        (action) => action.implementedAt.getTime() >= since,
      )
    )
      continue;
    result.push({
      key: `address-top-loss:${reason}:${entries[0].revisionId}`,
      rule: "address-top-loss",
      title: `Open an improvement action for "${reason}"`,
      detail: `"${reason}" was the largest classified loss in ${entries.length} of the last ${recent.length} verified shift reports, and no improvement action was implemented since.`,
      evidence: {
        revisionIds: entries.map((e) => e.revisionId),
        seconds: entries.map((e) => e.seconds),
      },
      assumptions: [
        `Largest classified loss in at least ${REPEATED_TOP_LOSS} of the last ${RECENT_REVISIONS} verified reports`,
        "Unclassified stops, planned breaks and unknown data are not candidates",
      ],
    });
  }
  return result;
}
