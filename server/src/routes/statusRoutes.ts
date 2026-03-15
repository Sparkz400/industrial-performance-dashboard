import express, { type Request, type Response } from "express";
import statusManager from "../utils/status.js";
import StatusConstants from "../utils/statusConstants.js";
import opcuaManager from "../opc-ua/services/opcuaConnectionManager.js";
import { rateLimiter } from "../middleware/security.js";
import config from "../config/config.js";

const router = express.Router();

router.get("/", rateLimiter, (req: Request, res: Response) => {
  const statusResponse = statusManager.getFullStatus();
  res.json(statusResponse);
});

router.get("/health", (req: Request, res: Response) => {
  const overallStatus = statusManager.getOverallStatus();
  const isHealthy = [
    StatusConstants.CONNECTED,
    StatusConstants.WARNING,
  ].includes(overallStatus as any);

  if (isHealthy) {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      message: "Service Unavailable",
      statusText: StatusConstants.getStatusLabel(overallStatus),
    });
  }
});

router.get("/debug", (req: Request, res: Response) => {
  const isAdmin = req.headers["x-api-key"] === config.ADMIN_API_KEY;

  if (!isAdmin) {
    res.status(403).json({
      error: "Unauthorized access to debug information",
    });
    return;
  }

  const diagnosticData = {
    ...statusManager.getFullStatus(),
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
