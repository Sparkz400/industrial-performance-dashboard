import { Router, type Request, type Response } from "express";
import Joi from "joi";
import { eq, and, asc, desc, gte, lte } from "drizzle-orm";
import { getReadDb } from "../database/db.js";
import { opcuaData } from "../database/schema.js";
import { validateQuery } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { assertMachine } from "../services/accessScope.js";

const router = Router();

const nodeDataSchema = Joi.object({
  nodeKey: Joi.string().required(),
  machineId: Joi.number().integer().positive().required(),
  limit: Joi.number().integer().min(1).max(5000).default(1000),
  offset: Joi.number().integer().min(0).default(0),
  latest: Joi.boolean().default(false),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

router.get(
  "/",
  validateQuery(nodeDataSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { nodeKey, machineId, limit, offset, startDate, endDate, latest } =
      req.query as unknown as {
        nodeKey: string;
        machineId: number;
        limit: number;
        offset: number;
        startDate?: string;
        endDate?: string;
        latest: boolean;
      };
    const readDb = getReadDb();
    assertMachine(machineId);

    const conditions = [eq(opcuaData.nodeKey, nodeKey)];
    if (machineId != null)
      conditions.push(eq(opcuaData.machineId, Number(machineId)));
    if (startDate)
      conditions.push(gte(opcuaData.timestamp, new Date(startDate)));
    if (endDate) conditions.push(lte(opcuaData.timestamp, new Date(endDate)));

    const result = await readDb
      .select({
        timestamp: opcuaData.timestamp,
        value: opcuaData.value,
        rawValue: opcuaData.rawValue,
        statusCode: opcuaData.statusCode,
        sourceTimestamp: opcuaData.sourceTimestamp,
        receivedAt: opcuaData.receivedAt,
        correctionRevision: opcuaData.correctionRevision,
        reportedStatusCode: opcuaData.reportedStatusCode,
        sourceClockState: opcuaData.sourceClockState,
        signalMetadata: opcuaData.signalMetadata,
        dataType: opcuaData.dataType,
      })
      .from(opcuaData)
      .where(and(...conditions))
      .orderBy(
        latest ? desc(opcuaData.timestamp) : asc(opcuaData.timestamp),
        latest ? desc(opcuaData.id) : asc(opcuaData.id),
      )
      .limit(limit)
      .offset(offset);

    const data = (latest ? result.reverse() : result).map((row) => ({
      ...row,
      timestamp: row.timestamp.toISOString(),
      time: new Date(row.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      value: row.value,
    }));

    res.json(data);
  }),
);

export default router;
