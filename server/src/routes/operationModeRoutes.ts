import { Router, type Request, type Response } from "express";
import Joi from "joi";
import { eq, and, asc, gte, lte } from "drizzle-orm";

import { getReadDb } from "../database/db.js";
import { opcuaData } from "../database/schema.js";
import { validateQuery } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

const operationModeSchema = Joi.object({
  machineId: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().min(1).max(5000).default(1000),
  offset: Joi.number().integer().min(0).default(0),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

router.get(
  "/",
  validateQuery(operationModeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit, offset, startDate, endDate } = req.query as unknown as {
      limit: number;
      offset: number;
      startDate?: string;
      endDate?: string;
    };
    const readDb = getReadDb();

    const conditions = [eq(opcuaData.nodeKey, "OperationMode")];
    if (req.query.machineId != null)
      conditions.push(eq(opcuaData.machineId, Number(req.query.machineId)));
    if (startDate)
      conditions.push(gte(opcuaData.timestamp, new Date(startDate)));
    if (endDate) conditions.push(lte(opcuaData.timestamp, new Date(endDate)));

    const result = await readDb
      .select({ timestamp: opcuaData.timestamp, value: opcuaData.value })
      .from(opcuaData)
      .where(and(...conditions))
      .orderBy(asc(opcuaData.timestamp))
      .limit(limit)
      .offset(offset);

    const data = result.map(
      (row: { timestamp: Date; value: number | null }) => ({
        timestamp: row.timestamp.toISOString(),
        time: new Date(row.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        mode: row.value,
      }),
    );
    res.json(data);
  }),
);

export default router;
