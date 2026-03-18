import express, { type Request, type Response } from "express";
import os from "os";
import logger from "../utils/logger.js";
import connectionTracker from "../utils/connectionTracker.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = express.Router();

const serverStartTime = new Date();

const bytesToMB = (bytes: number): number => Math.round(bytes / (1024 * 1024));

let previousCpuUsage: { idle: number; total: number } | null = null;

const calculateCpuUsage = (): number => {
  const cpus = os.cpus();

  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }

  if (previousCpuUsage === null) {
    previousCpuUsage = { idle: totalIdle, total: totalTick };
    return 0;
  }

  const idleDifference = totalIdle - previousCpuUsage.idle;
  const totalDifference = totalTick - previousCpuUsage.total;

  previousCpuUsage = { idle: totalIdle, total: totalTick };

  const usage = 100 - Math.floor((100 * idleDifference) / totalDifference);
  return Math.min(100, Math.max(0, usage));
};

router.get(
  "/stats",
  asyncHandler(async (req: Request, res: Response) => {
    const uptime = Math.floor(process.uptime());

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const cpuUsage = calculateCpuUsage();

    const platform = {
      type: os.type(),
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
    };

    const processMemoryUsage = process.memoryUsage();

    const stats = {
      uptime,
      memoryUsage: {
        total: bytesToMB(totalMemory),
        used: bytesToMB(usedMemory),
        free: bytesToMB(freeMemory),
        percentUsed: Math.round((usedMemory / totalMemory) * 100),
      },
      cpuUsage,
      cpuInfo: {
        cores: os.cpus().length,
        model: os.cpus()[0].model,
        speed: os.cpus()[0].speed,
      },
      nodeVersion: process.version,
      platform,
      processMemory: {
        rss: bytesToMB(processMemoryUsage.rss),
        heapTotal: bytesToMB(processMemoryUsage.heapTotal),
        heapUsed: bytesToMB(processMemoryUsage.heapUsed),
        external: bytesToMB(processMemoryUsage.external || 0),
      },
      activeConnections: connectionTracker.getActiveConnectionCount(),
      lastRestart: serverStartTime.toISOString(),
    };

    res.json(stats);
  }),
);

router.get(
  "/connections",
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;

    const stats = {
      activeCount: connectionTracker.getActiveConnectionCount(),
      activeConnections: connectionTracker.getConnectedClients(),
      history: connectionTracker.getConnectionHistory(limit),
    };

    res.json(stats);
  }),
);

export default router;
