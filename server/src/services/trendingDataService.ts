import { and, eq, gte, lte, asc, sql, inArray } from "drizzle-orm";
import { getReadDb } from "../database/db.js";
import { opcuaData, nodeMappings } from "../database/schema.js";
import logger from "../utils/logger.js";
import { ValidationError } from "../utils/errors.js";
import type {
  GetTrendingDataResponse,
  TrendingSeries,
} from "@performance-dashboard/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendingQueryParams {
  nodeKeys: string[];
  machineId?: number;
  startDate: Date;
  endDate: Date;
  downsampleBucketSeconds?: number;
  aggregation?: "avg" | "min" | "max" | "last";
}

export type TrendingResult = GetTrendingDataResponse;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_POINTS_PER_SERIES = 2000;
const MIN_AUTO_BUCKET_SECONDS = 60;

export function validateWindow(
  params: TrendingQueryParams,
): asserts params is TrendingQueryParams & { machineId: number } {
  if (!Number.isInteger(params.machineId) || params.machineId! <= 0) {
    throw new ValidationError(
      "Select one machine; node keys are not unique across machines",
    );
  }
  const span = params.endDate.getTime() - params.startDate.getTime();
  if (!Number.isFinite(span) || span <= 0 || span > 366 * 86400000) {
    throw new ValidationError(
      "Select a positive time window of at most 366 days",
    );
  }
  if (
    !params.nodeKeys.length ||
    params.nodeKeys.length > 32 ||
    params.nodeKeys.some((key) => !key.trim())
  ) {
    throw new ValidationError("Select between 1 and 32 non-empty node keys");
  }
  if (
    params.downsampleBucketSeconds != null &&
    (!Number.isFinite(params.downsampleBucketSeconds) ||
      params.downsampleBucketSeconds <= 0)
  ) {
    throw new ValidationError("Bucket duration must be positive");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBucketSeconds(
  startDate: Date,
  endDate: Date,
  explicitBucket?: number,
): number | null {
  if (explicitBucket != null && explicitBucket > 0) return explicitBucket;

  const rangeMs = endDate.getTime() - startDate.getTime();
  const rangeHours = rangeMs / (1000 * 60 * 60);

  if (rangeHours <= 24) return null; // raw data

  const bucket = Math.max(Math.round(rangeHours * 3), MIN_AUTO_BUCKET_SECONDS);
  return bucket;
}

function aggregationExpression(
  aggregation: TrendingQueryParams["aggregation"],
) {
  switch (aggregation) {
    case "min":
      return sql<number>`min(${opcuaData.value})`;
    case "max":
      return sql<number>`max(${opcuaData.value})`;
    case "last":
      return sql<number>`(array_agg(${opcuaData.value} ORDER BY ${opcuaData.timestamp} DESC, ${opcuaData.id} DESC))[1]`;
    case "avg":
    default:
      return sql<number>`avg(${opcuaData.value})`;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const trendingDataService = {
  /**
   * Query time-series data for one or more node keys, with optional
   * downsampling. Returns at most MAX_POINTS_PER_SERIES per series.
   */
  async queryTrendingData(
    params: TrendingQueryParams,
  ): Promise<TrendingResult> {
    validateWindow(params);
    const { machineId, startDate, endDate } = params;
    const nodeKeys = [...new Set(params.nodeKeys)];
    const readDb = getReadDb();
    const displayMap = await this.resolveDisplayNames(nodeKeys, machineId);
    const seriesList: TrendingSeries[] = [];
    for (const nodeKey of nodeKeys) {
      const condition = and(
        eq(opcuaData.nodeKey, nodeKey),
        eq(opcuaData.machineId, machineId),
        gte(opcuaData.timestamp, startDate),
        lte(opcuaData.timestamp, endDate),
      );
      const valid = sql`${opcuaData.statusCode} LIKE 'Good%' AND ${opcuaData.value} IS NOT NULL AND ${opcuaData.value} NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)`;
      const [summary] = await readDb
        .select({
          count: sql<number>`count(*)::int`,
          good: sql<number>`count(*) FILTER (WHERE ${valid})::int`,
          legacy: sql<number>`count(*) FILTER (WHERE ${opcuaData.signalMetadata} IS NULL)::int`,
          corrected: sql<number>`count(*) FILTER (WHERE ${opcuaData.correctionRevision} > 0)::int`,
          first: sql<Date | null>`min(${opcuaData.timestamp})`,
          last: sql<Date | null>`max(${opcuaData.timestamp})`,
          min: sql<
            number | null
          >`min(${opcuaData.value}) FILTER (WHERE ${valid})`,
          max: sql<
            number | null
          >`max(${opcuaData.value}) FILTER (WHERE ${valid})`,
          average: sql<
            number | null
          >`avg(${opcuaData.value}) FILTER (WHERE ${valid})`,
        })
        .from(opcuaData)
        .where(condition);
      const span = endDate.getTime() - startDate.getTime();
      const bucketMs =
        params.downsampleBucketSeconds != null ||
        summary.count > MAX_POINTS_PER_SERIES
          ? Math.max(
              Math.ceil(span / (MAX_POINTS_PER_SERIES - 1)),
              (params.downsampleBucketSeconds ?? 0) * 1000,
            )
          : null;
      const iso = (value: Date | string | null) =>
        value == null ? null : new Date(value).toISOString();
      const series: TrendingSeries = {
        nodeKey,
        displayName: displayMap.get(nodeKey) ?? nodeKey,
        machineId,
        resolutionMs: bucketMs,
        aggregation: params.aggregation ?? "avg",
        truncated: false,
        sampleCount: summary.count,
        goodSampleCount: summary.good,
        legacySampleCount: summary.legacy,
        correctedSampleCount: summary.corrected,
        requestedStart: startDate.toISOString(),
        requestedEnd: endDate.toISOString(),
        observedStart: iso(summary.first),
        observedEnd: iso(summary.last),
        continuity: "unverified",
        statistics: {
          min: summary.min,
          max: summary.max,
          average: summary.average,
        },
        data: [],
      };
      if (bucketMs != null) {
        // Anchor buckets to the requested start so the inclusive end still fits the cap.
        const bucket = sql`floor((extract(epoch from ${opcuaData.timestamp}) * 1000 - ${startDate.getTime()}) / ${bucketMs})`;
        const rows = await readDb
          .select({
            bucket: sql<number>`${bucket}::int`,
            value: sql<
              number | null
            >`CASE WHEN count(*) FILTER (WHERE ${valid}) = count(*) THEN ${aggregationExpression(params.aggregation)} ELSE NULL END`,
            count: sql<number>`count(*)::int`,
            good: sql<number>`count(*) FILTER (WHERE ${valid})::int`,
          })
          .from(opcuaData)
          .where(condition)
          .groupBy(sql`1`)
          .orderBy(sql`1`);
        const byBucket = new Map(rows.map((row) => [row.bucket, row]));
        for (let i = 0; i <= Math.floor(span / bucketMs); i++) {
          const row = byBucket.get(i);
          series.data.push({
            timestamp: new Date(
              startDate.getTime() + i * bucketMs,
            ).toISOString(),
            value: row?.value ?? null,
            sampleCount: row?.count ?? 0,
            goodSampleCount: row?.good ?? 0,
            statusCode: !row
              ? "Missing"
              : row.good === row.count
                ? "Good"
                : "MixedOrBad",
          });
        }
      } else {
        const rows = await readDb
          .select({
            timestamp: opcuaData.timestamp,
            value: opcuaData.value,
            statusCode: opcuaData.statusCode,
            sourceTimestamp: opcuaData.sourceTimestamp,
            receivedAt: opcuaData.receivedAt,
            correctionRevision: opcuaData.correctionRevision,
            reportedStatusCode: opcuaData.reportedStatusCode,
            sourceClockState: opcuaData.sourceClockState,
            rawValue: opcuaData.rawValue,
          })
          .from(opcuaData)
          .where(condition)
          .orderBy(asc(opcuaData.timestamp), asc(opcuaData.id))
          .limit(MAX_POINTS_PER_SERIES + 1);
        // A concurrent arrival may invalidate the earlier count; disclose rather than hide it.
        series.truncated = rows.length > MAX_POINTS_PER_SERIES;
        series.data = rows.slice(0, MAX_POINTS_PER_SERIES).map((row) => ({
          timestamp: row.timestamp.toISOString(),
          value:
            row.statusCode?.startsWith("Good") && Number.isFinite(row.value)
              ? row.value
              : null,
          statusCode: row.statusCode,
          sourceTimestamp: iso(row.sourceTimestamp),
          receivedAt: iso(row.receivedAt),
          correctionRevision: row.correctionRevision,
          reportedStatusCode: row.reportedStatusCode,
          sourceClockState: row.sourceClockState,
          rawValue: row.rawValue,
          sampleCount: 1,
          goodSampleCount:
            row.statusCode?.startsWith("Good") &&
            row.value != null &&
            Number.isFinite(row.value)
              ? 1
              : 0,
        }));
      }
      seriesList.push(series);
    }
    return { series: seriesList };
  },

  /**
   * List available tags (node mappings) for a machine.
   */
  async getAvailableTags(
    machineId: number,
  ): Promise<
    { nodeKey: string; displayName: string; dataType: string | null }[]
  > {
    const readDb = getReadDb();

    const rows = await readDb
      .select({
        nodeKey: nodeMappings.nodeKey,
        displayName: nodeMappings.displayName,
        dataType: nodeMappings.dataType,
      })
      .from(nodeMappings)
      .where(
        and(
          eq(nodeMappings.machineId, machineId),
          eq(nodeMappings.isActive, true),
        ),
      )
      .orderBy(asc(nodeMappings.displayName));

    return rows;
  },

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  async resolveDisplayNames(
    nodeKeys: string[],
    machineId?: number,
  ): Promise<Map<string, string>> {
    const readDb = getReadDb();
    const conditions = [inArray(nodeMappings.nodeKey, nodeKeys)];
    if (machineId != null) {
      conditions.push(eq(nodeMappings.machineId, machineId));
    }

    const rows = await readDb
      .select({
        nodeKey: nodeMappings.nodeKey,
        displayName: nodeMappings.displayName,
      })
      .from(nodeMappings)
      .where(and(...conditions));

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.nodeKey, row.displayName);
    }
    return map;
  },
};
