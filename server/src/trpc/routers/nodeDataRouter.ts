import { z } from "zod";
import { eq, and, asc, gte, lte, sql } from "drizzle-orm";
import { router, authedProcedure } from "../trpc.js";
import { getReadDb } from "../../database/db.js";
import { opcuaData } from "../../database/schema.js";

export const nodeDataRouter = router({
  history: authedProcedure
    .input(
      z.object({
        nodeKey: z.string(),
        machineId: z.number().int().optional(),
        limit: z.number().int().min(1).max(5000).default(1000),
        offset: z.number().int().min(0).default(0),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      }),
    )
    .query(async ({ input }) => {
      const readDb = getReadDb();
      const conditions = [eq(opcuaData.nodeKey, input.nodeKey)];

      if (input.machineId != null)
        conditions.push(eq(opcuaData.machineId, input.machineId));
      if (input.startDate)
        conditions.push(gte(opcuaData.timestamp, new Date(input.startDate)));
      if (input.endDate)
        conditions.push(lte(opcuaData.timestamp, new Date(input.endDate)));

      const result = await readDb
        .select({ timestamp: opcuaData.timestamp, value: opcuaData.value })
        .from(opcuaData)
        .where(and(...conditions))
        .orderBy(asc(opcuaData.timestamp))
        .limit(input.limit)
        .offset(input.offset);

      return result.map((row: { timestamp: Date; value: number | null }) => ({
        timestamp: row.timestamp.toISOString(),
        time: new Date(row.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        value: row.value,
      }));
    }),

  aggregates: authedProcedure
    .input(
      z.object({
        nodeKey: z.string(),
        machineId: z.number().int().optional(),
        resolution: z.enum(["hourly", "daily", "weekly"]).default("hourly"),
        start: z.string().datetime(),
        end: z.string().datetime(),
      }),
    )
    .query(async ({ input }) => {
      const readDb = getReadDb();

      const viewMap: Record<string, string> = {
        hourly: "opcua_data_hourly",
        daily: "opcua_data_daily",
        weekly: "opcua_data_weekly",
      };

      const viewName = viewMap[input.resolution] ?? "opcua_data_hourly";
      const machineFilter =
        input.machineId != null
          ? sql`AND machine_id = ${input.machineId}`
          : sql``;

      const result = await readDb.execute(sql`
        SELECT
          bucket,
          node_key AS "nodeKey",
          machine_id AS "machineId",
          avg_value AS "avgValue",
          min_value AS "minValue",
          max_value AS "maxValue",
          sample_count AS "sampleCount"
        FROM ${sql.identifier(viewName)}
        WHERE node_key = ${input.nodeKey}
          AND bucket >= ${new Date(input.start).toISOString()}::timestamptz
          AND bucket <= ${new Date(input.end).toISOString()}::timestamptz
          ${machineFilter}
        ORDER BY bucket ASC
      `);

      return result.rows ?? result;
    }),
});
