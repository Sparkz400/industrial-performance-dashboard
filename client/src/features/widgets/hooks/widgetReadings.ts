export interface NodeDataPoint {
  timestamp: string;
  time: string;
  value: number | null;
  rawValue?: unknown;
  statusCode?: string | null;
  receivedAt?: string | null;
  sourceTimestamp?: string | null;
  correctionRevision?: number;
  reportedStatusCode?: string | null;
  sourceClockState?: string;
}
/**
 * Preserve source evidence while leaving invalid values and long gaps unknown.
 * @param rows Source observations.
 * @param maxGapMs Maximum implied continuity between observations.
 */
export function widgetReadings(rows: NodeDataPoint[], maxGapMs = 60000): NodeDataPoint[] {
  const result: NodeDataPoint[] = [];
  const sorted = [...rows]
    .filter((row) => Number.isFinite(Date.parse(row.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const row of sorted) {
    const previous = result.at(-1);
    if (previous && Date.parse(row.timestamp) - Date.parse(previous.timestamp) > maxGapMs)
      result.push({
        timestamp: new Date(Date.parse(previous.timestamp) + maxGapMs).toISOString(),
        time: 'Unknown interval',
        value: null,
        statusCode: 'UnknownGap',
      });
    result.push({
      ...row,
      value:
        row.statusCode?.startsWith('Good') &&
        row.sourceClockState !== 'future' &&
        Date.parse(row.timestamp) <= Date.now() + 5000 &&
        (!row.sourceTimestamp ||
          Date.parse(row.sourceTimestamp) <= Date.parse(row.timestamp) + 5000) &&
        typeof row.value === 'number' &&
        Number.isFinite(row.value)
          ? row.value
          : null,
    });
  }
  return result;
}
