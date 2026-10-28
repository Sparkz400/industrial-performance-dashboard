import { Router, type Request, type Response } from "express";
import Joi from "joi";
import { sql } from "drizzle-orm";
import { getReadDb } from "../database/db.js";
import { validateQuery } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ValidationError } from "../utils/errors.js";
import { assertMachine } from "../services/accessScope.js";

const router = Router();

const aggregateSchema = Joi.object({
  nodeKey: Joi.string().required(),
  machineId: Joi.number().integer().positive().required(),
  resolution: Joi.string().valid("hourly", "daily", "weekly").default("hourly"),
  start: Joi.date().iso().required(),
  end: Joi.date().iso().required(),
});

const VIEW_MAP: Record<string, string> = {
  hourly: "hour",
  daily: "day",
  weekly: "week",
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

    assertMachine(machineId);
    const from = new Date(start),
      to = new Date(end);
    if (to <= from || to.getTime() - from.getTime() > 366 * 86400000)
      throw new ValidationError("Choose a positive window of at most 366 days");
    const period = VIEW_MAP[resolution] ?? "hour";

    const result = await readDb.execute(sql`
      SELECT
        date_trunc(${period},timestamp,'UTC') AS bucket,
        node_key AS "nodeKey",
        machine_id AS "machineId",
        CASE WHEN bool_and(coalesce(status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real),false)) AND count(signal_metadata)=count(*) AND min(md5(signal_metadata::text))=max(md5(signal_metadata::text)) THEN avg(value::double precision) ELSE NULL END AS "avgValue",
        CASE WHEN bool_and(coalesce(status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real),false)) AND count(signal_metadata)=count(*) AND min(md5(signal_metadata::text))=max(md5(signal_metadata::text)) THEN min(value) ELSE NULL END AS "minValue",
        CASE WHEN bool_and(coalesce(status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real),false)) AND count(signal_metadata)=count(*) AND min(md5(signal_metadata::text))=max(md5(signal_metadata::text)) THEN max(value) ELSE NULL END AS "maxValue",
        count(*)::integer AS "sampleCount",
        count(*) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real))::integer AS "goodSampleCount",
        CASE WHEN count(signal_metadata)=0 THEN 'unknown' WHEN count(signal_metadata)<count(*) OR min(md5(signal_metadata::text))<>max(md5(signal_metadata::text)) THEN 'mixed' ELSE min(md5(signal_metadata::text)) END AS identity,
        count(*) FILTER(WHERE correction_revision>0)::integer AS "correctedSampleCount",
        'current-raw-projection' AS source,'unverified' AS continuity
      FROM opcua_data
      WHERE node_key = ${nodeKey}
        AND timestamp >= ${from.toISOString()}::timestamptz
        AND timestamp < ${to.toISOString()}::timestamptz
        AND machine_id = ${Number(machineId)}
      GROUP BY 1,2,3
      ORDER BY bucket ASC LIMIT 8785
    `);

    res.json(result.rows ?? result);
  }),
);

export default router;
