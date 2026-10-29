const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Alarm routing: event subscription, lowest severity and machine scope of a destination. */
export function routesAlarm(
  destination: {
    events: unknown;
    minSeverity: string | null;
    machineIds: number[] | null;
  },
  type: string,
  severity: string | null | undefined,
  machineId: number | null | undefined,
): boolean {
  const events = Array.isArray(destination.events)
    ? (destination.events as string[])
    : [];
  if (!events.includes(type) && !events.includes("*")) return false;
  if (
    destination.minSeverity &&
    (SEVERITY_RANK[severity ?? ""] ?? -1) <
      (SEVERITY_RANK[destination.minSeverity] ?? 0)
  )
    return false;
  const machines = destination.machineIds ?? [];
  return (
    !machines.length || (machineId != null && machines.includes(machineId))
  );
}
