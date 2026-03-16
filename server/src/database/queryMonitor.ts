export interface QueryExecutionRecord {
  text: string;
  durationMs: number;
  target: string;
  rowCount?: number | null;
  errorCode?: string;
  errorMessage?: string;
}

interface QueryAggregate {
  fingerprint: string;
  count: number;
  errorCount: number;
  slowCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
  lastTarget: string;
  lastSeenAt: string;
}

interface RecentQueryRecord extends QueryExecutionRecord {
  timestamp: string;
}

export interface QueryMetricsSnapshot {
  startedAt: string;
  totalQueries: number;
  failedQueries: number;
  slowQueries: number;
  averageDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  perTarget: Record<string, number>;
  topQueries: Array<{
    fingerprint: string;
    count: number;
    errorCount: number;
    slowCount: number;
    averageDurationMs: number;
    maxDurationMs: number;
    lastDurationMs: number;
    lastTarget: string;
    lastSeenAt: string;
  }>;
  recentSlowQueries: RecentQueryRecord[];
  recentFailures: RecentQueryRecord[];
}

const normalizeQuery = (text: string): string =>
  text.replace(/\s+/g, " ").trim().slice(0, 180) || "unknown";

const calculatePercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );

  return Number(sorted[index].toFixed(2));
};

export default class DatabaseQueryMonitor {
  private readonly startedAt = new Date().toISOString();
  private readonly slowThresholdMs: number;
  private readonly maxSamples: number;
  private totalQueries = 0;
  private failedQueries = 0;
  private slowQueries = 0;
  private totalDurationMs = 0;
  private maxDurationMs = 0;
  private readonly perTarget = new Map<string, number>();
  private readonly durations: number[] = [];
  private readonly aggregates = new Map<string, QueryAggregate>();
  private readonly slowQueryRecords: RecentQueryRecord[] = [];
  private readonly failureRecords: RecentQueryRecord[] = [];

  constructor(slowThresholdMs: number, maxSamples: number) {
    this.slowThresholdMs = slowThresholdMs;
    this.maxSamples = maxSamples;
  }

  record(record: QueryExecutionRecord): void {
    const fingerprint = normalizeQuery(record.text);
    const timestamp = new Date().toISOString();
    const isSlow = record.durationMs >= this.slowThresholdMs;
    const hasFailed = Boolean(record.errorCode || record.errorMessage);
    const aggregate = this.aggregates.get(fingerprint) ?? {
      fingerprint,
      count: 0,
      errorCount: 0,
      slowCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      lastDurationMs: 0,
      lastTarget: record.target,
      lastSeenAt: timestamp,
    };

    this.totalQueries += 1;
    this.totalDurationMs += record.durationMs;
    this.maxDurationMs = Math.max(this.maxDurationMs, record.durationMs);
    this.durations.push(record.durationMs);
    if (this.durations.length > this.maxSamples) {
      this.durations.shift();
    }

    this.perTarget.set(
      record.target,
      (this.perTarget.get(record.target) ?? 0) + 1,
    );

    aggregate.count += 1;
    aggregate.totalDurationMs += record.durationMs;
    aggregate.maxDurationMs = Math.max(
      aggregate.maxDurationMs,
      record.durationMs,
    );
    aggregate.lastDurationMs = record.durationMs;
    aggregate.lastTarget = record.target;
    aggregate.lastSeenAt = timestamp;

    if (isSlow) {
      this.slowQueries += 1;
      aggregate.slowCount += 1;
      this.slowQueryRecords.push({ ...record, timestamp });
      if (this.slowQueryRecords.length > this.maxSamples) {
        this.slowQueryRecords.shift();
      }
    }

    if (hasFailed) {
      this.failedQueries += 1;
      aggregate.errorCount += 1;
      this.failureRecords.push({ ...record, timestamp });
      if (this.failureRecords.length > this.maxSamples) {
        this.failureRecords.shift();
      }
    }

    this.aggregates.set(fingerprint, aggregate);
  }

  getSnapshot(limit = 5): QueryMetricsSnapshot {
    const averageDurationMs =
      this.totalQueries === 0
        ? 0
        : Number((this.totalDurationMs / this.totalQueries).toFixed(2));

    const topQueries = [...this.aggregates.values()]
      .sort((left, right) => {
        if (right.totalDurationMs !== left.totalDurationMs) {
          return right.totalDurationMs - left.totalDurationMs;
        }
        return right.maxDurationMs - left.maxDurationMs;
      })
      .slice(0, limit)
      .map((aggregate) => ({
        fingerprint: aggregate.fingerprint,
        count: aggregate.count,
        errorCount: aggregate.errorCount,
        slowCount: aggregate.slowCount,
        averageDurationMs: Number(
          (aggregate.totalDurationMs / aggregate.count).toFixed(2),
        ),
        maxDurationMs: Number(aggregate.maxDurationMs.toFixed(2)),
        lastDurationMs: Number(aggregate.lastDurationMs.toFixed(2)),
        lastTarget: aggregate.lastTarget,
        lastSeenAt: aggregate.lastSeenAt,
      }));

    return {
      startedAt: this.startedAt,
      totalQueries: this.totalQueries,
      failedQueries: this.failedQueries,
      slowQueries: this.slowQueries,
      averageDurationMs,
      p95DurationMs: calculatePercentile(this.durations, 95),
      maxDurationMs: Number(this.maxDurationMs.toFixed(2)),
      perTarget: Object.fromEntries(this.perTarget.entries()),
      topQueries,
      recentSlowQueries: [...this.slowQueryRecords].slice(-limit).reverse(),
      recentFailures: [...this.failureRecords].slice(-limit).reverse(),
    };
  }

  getStatusSummary(): Pick<
    QueryMetricsSnapshot,
    | "startedAt"
    | "totalQueries"
    | "failedQueries"
    | "slowQueries"
    | "averageDurationMs"
    | "p95DurationMs"
    | "maxDurationMs"
    | "perTarget"
  > {
    const snapshot = this.getSnapshot(3);

    return {
      startedAt: snapshot.startedAt,
      totalQueries: snapshot.totalQueries,
      failedQueries: snapshot.failedQueries,
      slowQueries: snapshot.slowQueries,
      averageDurationMs: snapshot.averageDurationMs,
      p95DurationMs: snapshot.p95DurationMs,
      maxDurationMs: snapshot.maxDurationMs,
      perTarget: snapshot.perTarget,
    };
  }
}
