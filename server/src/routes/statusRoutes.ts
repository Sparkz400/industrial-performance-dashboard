import { performance } from "node:perf_hooks";

import express, { type Request, type Response } from "express";
import IORedis from "ioredis";
import statusManager from "../utils/status.js";
import StatusConstants from "../utils/statusConstants.js";
import opcuaManager from "../opc-ua/services/opcuaConnectionManager.js";
import multiMachineManager from "../opc-ua/services/multiMachineManager.js";
import dbClient from "../database/dbConnection.js";
import { rateLimiter } from "../middleware/security.js";
import config from "../config/config.js";
import logger from "../utils/logger.js";
import type { DependencyCheck } from "@performance-dashboard/shared";

const router = express.Router();

router.get("/", rateLimiter, (req: Request, res: Response) => {
  const statusResponse = statusManager.getFullStatus();
  res.json(statusResponse);
});

async function checkDatabase(): Promise<DependencyCheck> {
  const start = performance.now();
  try {
    await dbClient.pool.query("SELECT 1");
    return {
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err: any) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      message: err.message,
    };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  if (!config.REDIS_URL) {
    return { status: "ok", message: "Not configured (optional)" };
  }
  try {
    const Redis = (IORedis as any).default || IORedis;
    const redis = new Redis(config.REDIS_URL!, {
      connectTimeout: 3000,
      lazyConnect: true,
    });
    const start = performance.now();
    await redis.connect();
    await redis.ping();
    const latencyMs = Math.round(performance.now() - start);
    await redis.quit();
    return { status: "ok", latencyMs };
  } catch (err: any) {
    return { status: "degraded", message: err.message };
  }
}

function checkOpcUa(): DependencyCheck {
  const opcuaStatus = statusManager.getServiceStatus(StatusConstants.OPCUA);
  const connectedMachines = multiMachineManager.getConnectedMachineIds();

  if (
    opcuaStatus === StatusConstants.CONNECTED ||
    connectedMachines.length > 0
  ) {
    return {
      status: "ok",
      message: `${connectedMachines.length} machine(s) connected`,
    };
  }
  if (
    opcuaStatus === StatusConstants.WARNING ||
    opcuaStatus === StatusConstants.CONNECTING
  ) {
    return {
      status: "degraded",
      message: StatusConstants.getStatusLabel(opcuaStatus),
    };
  }
  return {
    status: "error",
    message: StatusConstants.getStatusLabel(opcuaStatus),
  };
}

router.get("/health", async (req: Request, res: Response) => {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const opcua = checkOpcUa();

  const checks = { database, redis, opcua };

  // Overall: error if DB is down, degraded if optional services have issues
  const hasError = database.status === "error";
  const hasDegraded =
    database.status === "degraded" ||
    redis.status === "error" ||
    opcua.status === "error";

  let overallStatus: "ok" | "degraded" | "error";
  if (hasError) {
    overallStatus = "error";
  } else if (hasDegraded) {
    overallStatus = "degraded";
  } else {
    overallStatus = "ok";
  }

  const statusCode = overallStatus === "error" ? 503 : 200;

  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks,
  });
});

router.get("/debug", (req: Request, res: Response) => {
  const isAdmin = req.headers["x-api-key"] === config.ADMIN_API_KEY;

  if (!isAdmin) {
    res.status(403).json({
      error: "Unauthorized access to debug information",
    });
    return;
  }

  const fullStatus = statusManager.getFullStatus();
  const diagnosticData = {
    ...fullStatus,
    database: {
      ...fullStatus.database,
      connections: dbClient.getConnectionOverview(),
      queryMetrics: dbClient.getQueryMetrics(),
    },
    opcuaConnection: opcuaManager.getConnectionInfo(),
    system: {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
    },
  };

  res.json(diagnosticData);
});

export default router;
