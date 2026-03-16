import express, { type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import db, { getReadDb } from "../db.js";
import dbManager from "../dbConnection.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

const router = express.Router();

// A simple test endpoint to verify DB connectivity.
router.get(
  "/test",
  asyncHandler(async (req: Request, res: Response) => {
    const target = req.query.target === "read" ? "read" : "write";
    const database = target === "read" ? getReadDb() : db;
    const result = await database.execute(sql`SELECT NOW()`);

    res.json({
      status: "ok",
      target,
      time: result.rows[0],
      connections: dbManager.getConnectionOverview(),
    });
  }),
);

router.get(
  "/metrics",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      connections: dbManager.getConnectionOverview(),
      queryMetrics: dbManager.getQueryMetrics(),
    });
  }),
);

export default router;
