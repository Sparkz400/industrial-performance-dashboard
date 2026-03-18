import { Router, type Request, type Response } from "express";
import Joi from "joi";
import { sql } from "drizzle-orm";
import { getReadDb } from "../database/db.js";
import { validateQuery } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

const aggregateSchema = Joi.object({
  nodeKey: Joi.string().required(),
  machineId: Joi.number().integer().optional(),
  resolution: Joi.string().valid("hourly", "daily", "weekly").default("hourly"),
  start: Joi.date().iso().required(),
  end: Joi.date().iso().required(),
});

const VIEW_MAP: Record<string, string> = {
  hourly: "opcua_data_hourly",
  daily: "opcua_data_daily",
  weekly: "opcua_data_weekly",
};

router.get(
  "/",
  validateQuery(aggregateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { nodeKey, machineId, resolution, start, end } = req.query as {
      nodeKey: string;
      machineId?: string;
      resolution: string;
      start: string;
      end: string;
    };
    const readDb = getReadDb();

    const viewName = VIEW_MAP[resolution] ?? "opcua_data_hourly";

    // Fallback to raw query on the materialized view
    // The views have columns: bucket, node_key, machine_id, avg_value, min_value, max_value, sample_count
    const machineFilter =
      machineId != null ? sql`AND machine_id = ${Number(machineId)}` : sql``;

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
      WHERE node_key = ${nodeKey}
        AND bucket >= ${new Date(start).toISOString()}::timestamptz
        AND bucket <= ${new Date(end).toISOString()}::timestamptz
        ${machineFilter}
      ORDER BY bucket ASC
    `);

    res.json(result.rows ?? result);
  }),
);

export default router;
