import { and, eq, gte, lte, asc, sql, inArray } from "drizzle-orm";
import { getReadDb } from "../database/db.js";
import { opcuaData, nodeMappings } from "../database/schema.js";
import logger from "../utils/logger.js";
import { ValidationError } from "../utils/errors.js";

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

interface DataPoint {
  timestamp: string;
  value: number | null;
}

interface Series {
  nodeKey: string;
  displayName: string;
  data: DataPoint[];
}

export interface TrendingResult {
  series: Series[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_POINTS_PER_SERIES = 2000;
const MIN_AUTO_BUCKET_SECONDS = 60;

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
      return sql<number>`(array_agg(${opcuaData.value} ORDER BY ${opcuaData.timestamp} DESC))[1]`;
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
    const { nodeKeys, machineId, startDate, endDate, aggregation } = params;

    if (nodeKeys.length === 0) {
      throw new ValidationError("At least one nodeKey is required");
    }

    const readDb = getReadDb();

    // Resolve display names
    const displayMap = await this.resolveDisplayNames(nodeKeys, machineId);

    const bucketSeconds = computeBucketSeconds(
      startDate,
      endDate,
      params.downsampleBucketSeconds,
    );

    const seriesList: Series[] = [];

    for (const nodeKey of nodeKeys) {
      let rows: { timestamp: unknown; value: number | null }[];

      const conditions = [
        eq(opcuaData.nodeKey, nodeKey),
        gte(opcuaData.timestamp, startDate),
        lte(opcuaData.timestamp, endDate),
      ];
      if (machineId != null) {
        conditions.push(eq(opcuaData.machineId, machineId));
      }

      if (bucketSeconds != null) {
        // Downsampled query
        const bucketExpr = sql`to_timestamp(floor(extract(epoch from ${opcuaData.timestamp}) / ${bucketSeconds}) * ${bucketSeconds})`;
        const aggExpr = aggregationExpression(aggregation);

        rows = await readDb
          .select({
            timestamp: bucketExpr.as("bucket"),
            value: aggExpr.as("value"),
          })
          .from(opcuaData)
          .where(and(...conditions))
          .groupBy(bucketExpr, opcuaData.nodeKey)
          .orderBy(asc(bucketExpr))
          .limit(MAX_POINTS_PER_SERIES);
      } else {
        // Raw query
        rows = await readDb
          .select({
            timestamp: opcuaData.timestamp,
            value: opcuaData.value,
          })
          .from(opcuaData)
          .where(and(...conditions))
          .orderBy(asc(opcuaData.timestamp))
          .limit(MAX_POINTS_PER_SERIES);
      }

      seriesList.push({
        nodeKey,
        displayName: displayMap.get(nodeKey) ?? nodeKey,
        data: rows.map((r) => ({
          timestamp:
            r.timestamp instanceof Date
              ? r.timestamp.toISOString()
              : String(r.timestamp),
          value: r.value,
        })),
      });
    }

    logger.debug(
      `[TrendingData] Queried ${nodeKeys.length} series, bucket=${bucketSeconds ?? "raw"}s`,
    );

    return { series: seriesList };
  },

  /**
   * Export trending data as a CSV string. No per-series cap is applied so
   * that exports include the full dataset.
   */
  async exportCsv(params: TrendingQueryParams): Promise<string> {
    const { nodeKeys, machineId, startDate, endDate, aggregation } = params;

    if (nodeKeys.length === 0) {
      throw new ValidationError("At least one nodeKey is required");
    }

    const readDb = getReadDb();
    const bucketSeconds = computeBucketSeconds(
      startDate,
      endDate,
      params.downsampleBucketSeconds,
    );

    // Collect all data points keyed by timestamp per nodeKey
    const dataByTimestamp = new Map<string, Record<string, number | null>>();

    for (const nodeKey of nodeKeys) {
      const conditions = [
        eq(opcuaData.nodeKey, nodeKey),
        gte(opcuaData.timestamp, startDate),
        lte(opcuaData.timestamp, endDate),
      ];
      if (machineId != null) {
        conditions.push(eq(opcuaData.machineId, machineId));
      }

      let rows: { timestamp: unknown; value: number | null }[];

      if (bucketSeconds != null) {
        const bucketExpr = sql`to_timestamp(floor(extract(epoch from ${opcuaData.timestamp}) / ${bucketSeconds}) * ${bucketSeconds})`;
        const aggExpr = aggregationExpression(aggregation);

        rows = await readDb
          .select({
            timestamp: bucketExpr.as("bucket"),
            value: aggExpr.as("value"),
          })
          .from(opcuaData)
          .where(and(...conditions))
          .groupBy(bucketExpr, opcuaData.nodeKey)
          .orderBy(asc(bucketExpr));
      } else {
        rows = await readDb
          .select({
            timestamp: opcuaData.timestamp,
            value: opcuaData.value,
          })
          .from(opcuaData)
          .where(and(...conditions))
          .orderBy(asc(opcuaData.timestamp));
      }

      for (const row of rows) {
        const ts =
          row.timestamp instanceof Date
            ? row.timestamp.toISOString()
            : String(row.timestamp);
        if (!dataByTimestamp.has(ts)) {
          dataByTimestamp.set(ts, {});
        }
        dataByTimestamp.get(ts)![nodeKey] = row.value;
      }
    }

    // Build CSV
    const header = ["timestamp", ...nodeKeys].join(",");
    const sortedTimestamps = Array.from(dataByTimestamp.keys()).sort();

    const lines = [header];
    for (const ts of sortedTimestamps) {
      const record = dataByTimestamp.get(ts)!;
      const values = nodeKeys.map((k) =>
        record[k] != null ? String(record[k]) : "",
      );
      lines.push([ts, ...values].join(","));
    }

    return lines.join("\n");
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
