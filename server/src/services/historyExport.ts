import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import manager from "../database/dbConnection.js";
import { getSessionUser } from "./sessionAccess.js";
import {
  validateWindow,
  type TrendingQueryParams,
} from "./trendingDataService.js";
import { UnauthorizedError, ValidationError } from "../utils/errors.js";

export const csvCell = (value: unknown): string => {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return (
    '"' +
    (typeof value === "string" && /^[=+@\-\t\r]/.test(text) ? "'" : "") +
    text.replaceAll('"', '""') +
    '"'
  );
};
let active = 0;
/** A database snapshot fixes the export while ingestion continues. */
export async function streamHistory(
  req: Request,
  res: Response,
  params: TrendingQueryParams,
) {
  validateWindow(params);
  if (active >= 3)
    throw new ValidationError(
      "Three exports are already running; try again shortly",
    );
  active++;
  let connection: PoolClient | undefined;
  try {
    connection = await manager.pool.connect();
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await connection.query("SET LOCAL statement_timeout = '30s'");
    await connection.query(
      "SET LOCAL idle_in_transaction_session_timeout = '45s'",
    );
    const aggregate = params.downsampleBucketSeconds != null;
    const expression = {
      avg: "avg(value)",
      min: "min(value)",
      max: "max(value)",
      last: "max(value) FILTER (WHERE export_rank=1)",
    }[params.aggregation ?? "avg"];
    // Rank the last value without accumulating an unbounded array for a dense bucket.
    const source =
      params.aggregation === "last"
        ? `(SELECT timestamp,node_key,value,status_code,
        row_number() OVER (PARTITION BY node_key,floor((extract(epoch FROM timestamp)-extract(epoch FROM $3::timestamptz))/$5)
        ORDER BY timestamp DESC,id DESC) AS export_rank
        FROM opcua_data WHERE machine_id=$1 AND node_key=ANY($2) AND timestamp >= $3 AND timestamp <= $4) AS ranked`
        : "opcua_data";
    const query = aggregate
      ? `SELECT to_timestamp(floor((extract(epoch FROM timestamp)-extract(epoch FROM $3::timestamptz))/$5)*$5+extract(epoch FROM $3::timestamptz)) AS timestamp,
      node_key,CASE WHEN bool_and(coalesce(status_code LIKE 'Good%' AND value IS NOT NULL,false)) THEN ${expression} ELSE NULL END AS value,
      count(*) AS sample_count,count(*) FILTER(WHERE status_code LIKE 'Good%' AND value IS NOT NULL) AS good_sample_count,
      CASE WHEN bool_and(coalesce(status_code LIKE 'Good%' AND value IS NOT NULL,false)) THEN 'Good' ELSE 'MixedOrBad' END AS status_code
      FROM ${source} ${params.aggregation === "last" ? "" : "WHERE machine_id=$1 AND node_key=ANY($2) AND timestamp >= $3 AND timestamp <= $4"} GROUP BY 1,node_key ORDER BY 1,node_key`
      : `
      SELECT id, timestamp, node_key, value, raw_value, status_code, data_type, source_timestamp, received_at, signal_metadata
      FROM opcua_data WHERE machine_id=$1 AND node_key=ANY($2) AND timestamp >= $3 AND timestamp <= $4
      ORDER BY timestamp,id`;
    await connection.query(
      `DECLARE history_export NO SCROLL CURSOR FOR ${query}`,
      [
        params.machineId,
        params.nodeKeys,
        params.startDate,
        params.endDate,
        ...(aggregate ? [params.downsampleBucketSeconds] : []),
      ],
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="measurements.csv"',
    );
    // Compression replaces response drain handling; raw export uses native backpressure.
    res.setHeader("Cache-Control", "no-store, no-transform");
    const write = async (text: string) => {
      if (res.destroyed) throw new Error("Export disconnected");
      if (!res.write(text))
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer);
            res.off("drain", ready);
            res.off("close", closed);
            res.off("error", failed);
          };
          const ready = () => {
            cleanup();
            resolve();
          };
          const failed = (error: Error) => {
            cleanup();
            reject(error);
          };
          const closed = () => failed(new Error("Export disconnected"));
          const timer = setTimeout(() => {
            failed(new Error("Export reader timed out"));
            res.destroy();
          }, 30000);
          res.once("drain", ready);
          res.once("close", closed);
          res.once("error", failed);
        });
    };
    await write(
      aggregate
        ? "timestamp,nodeKey,value,sampleCount,goodSampleCount,statusCode\r\n"
        : "id,timestamp,nodeKey,value,rawValue,statusCode,dataType,sourceTimestamp,receivedAt,signalMetadata\r\n",
    );
    const deadline = Date.now() + 15 * 60000;
    for (;;) {
      if (!(await getSessionUser(req.session))) throw new UnauthorizedError();
      if (Date.now() > deadline)
        throw new Error(
          "Export exceeded fifteen minutes; select a shorter window",
        );
      const { rows } = await connection.query(
        "FETCH FORWARD 1000 FROM history_export",
      );
      if (!rows.length) break;
      await write(
        rows
          .map((row) =>
            Object.values(row)
              .map((value) =>
                csvCell(value instanceof Date ? value.toISOString() : value),
              )
              .join(","),
          )
          .join("\r\n") + "\r\n",
      );
    }
    await connection.query("COMMIT");
    res.end();
  } catch (error) {
    await connection?.query("ROLLBACK").catch(() => undefined);
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    throw error;
  } finally {
    connection?.release();
    active--;
  }
}
