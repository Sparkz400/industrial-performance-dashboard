import maintenanceRoutes from "./src/routes/maintenanceRoutes.js";
import qualityRoutes from "./src/routes/qualityRoutes.js";
import lineRoutes from "./src/routes/lineRoutes.js";
import maintenanceActionRoutes from "./src/routes/maintenanceActionRoutes.js";
import energyRoutes from "./src/routes/energyRoutes.js";
import historyRoutes from "./src/routes/historyRoutes.js";
import cmmsRoutes from "./src/routes/cmmsRoutes.js";
import energyCostRoutes from "./src/routes/energyCostRoutes.js";
import derivedSignalRoutes from "./src/routes/derivedSignalRoutes.js";
import widgetEvidenceRoutes from "./src/routes/widgetEvidenceRoutes.js";
import planningRoutes from "./src/routes/planningRoutes.js";
import comparisonRoutes from "./src/routes/comparisonRoutes.js";
import configBundleRoutes from "./src/routes/configBundleRoutes.js";
import diagnosticsRoutes from "./src/routes/diagnosticsRoutes.js";
import alarmReviewRoutes from "./src/routes/alarmReviewRoutes.js";
import workOrderRoutes from "./src/routes/workOrderRoutes.js";
import "dotenv/config";

// Initialize OpenTelemetry tracing BEFORE importing any instrumented modules
import { initTracing } from "./src/observability/tracing.js";
initTracing();

import express, { type Request, type Response } from "express";
import http from "http";
import path from "node:path";
import { existsSync } from "node:fs";

import config from "./src/config/config.js";
import dbClient from "./src/database/dbConnection.js";
import logger from "./src/utils/logger.js";
import { customWidgetService } from "./src/services/customWidgetService.js";
import statusManager from "./src/utils/status.js";
import { requireAssetAccess } from "./src/middleware/assetAccess.js";
import accessRoutes from "./src/routes/accessRoutes.js";
import StatusConstants from "./src/utils/statusConstants.js";

import { setupMiddleware } from "./src/middleware/setupMiddleware.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import {
  metricsMiddleware,
  metricsRegistry,
} from "./src/observability/metrics.js";
import "./src/observability/operationalMetrics.js";
import {
  requireAuth,
  requireRole,
  requireMutationAccess,
} from "./src/middleware/auth.js";

import { createSocketServer } from "./src/socket/socketServer.js";
import {
  setupOpcuaBridge,
  startOpcuaServices,
  createShutdown,
} from "./src/opcuaBridge.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, createContext } from "./src/trpc/index.js";
import { edgeSyncService } from "./src/services/edgeSyncService.js";
import { reportSchedulerService } from "./src/services/reportSchedulerService.js";
import { healthIncidentService } from "./src/services/healthIncidentService.js";

// --- Route modules ---
import productionRoutes from "./src/routes/productionRoutes.js";
import operatorRoutes from "./src/routes/operatorRoutes.js";
import inspectionRoutes from "./src/routes/inspectionRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import systemRoutes from "./src/routes/systemRoutes.js";
import dashboardRoutes from "./src/routes/dashboardRoutes.js";
import opcuaRoutes from "./src/opc-ua/routes/opcuaRoutes.js";
import dbRoutes from "./src/database/routes/dbRoutes.js";
import certificateRoutes from "./src/opc-ua/routes/certificateRoutes.js";
import statusRoutes from "./src/routes/statusRoutes.js";
import machineRoutes from "./src/routes/machineRoutes.js";
import operationModeRoutes from "./src/routes/operationModeRoutes.js";
import auditLogRoutes from "./src/routes/auditLogRoutes.js";
import webhookRoutes from "./src/routes/webhookRoutes.js";
import shareRoutes, { embedFramePolicy } from "./src/routes/shareRoutes.js";
import customWidgetRoutes from "./src/routes/customWidgetRoutes.js";
import widgetRuntimeRoutes from "./src/routes/widgetRuntimeRoutes.js";
import alarmRoutes from "./src/routes/alarmRoutes.js";
import annotationRoutes from "./src/routes/annotationRoutes.js";
import nodeDataRoutes from "./src/routes/nodeDataRoutes.js";
import aggregateRoutes from "./src/routes/aggregateRoutes.js";

// --- Tier 2 Route modules ---
import complianceRoutes from "./src/routes/complianceRoutes.js";
import spcRoutes from "./src/routes/spcRoutes.js";
import recipeRoutes from "./src/routes/recipeRoutes.js";
import batchRoutes from "./src/routes/batchRoutes.js";
import digitalTwinRoutes from "./src/routes/digitalTwinRoutes.js";
import edgeRoutes from "./src/routes/edgeRoutes.js";

// --- Tier 1 Route modules ---
import plantRoutes from "./src/routes/plantRoutes.js";
import oeeRoutes from "./src/routes/oeeRoutes.js";
import alertEngineRoutes from "./src/routes/alertRoutes2.js";
import trendingRoutes from "./src/routes/trendingRoutes.js";
import reportRoutes from "./src/routes/reportRoutes.js";

// --- App Factory ---
export function createApp() {
  const app = express();

  // --- Metrics collection middleware ---
  app.use(metricsMiddleware);

  const { sessionStore, sessionMiddleware, invalidCsrfTokenError } =
    setupMiddleware(app);
  // Registered widget origins become frame sources; until loaded, none are allowed.
  customWidgetService
    .refreshFrameOrigins()
    .catch((error) =>
      logger.warn(`[Widgets] Frame sources not loaded: ${String(error)}`),
    );

  app.get("/healthz", async (_req, res) => {
    try {
      await dbClient.pool.query("SELECT 1");
      res.json({
        status: "ready",
        mode: config.RECOVERY_MODE ? "recovery" : "normal",
      });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.get(
    "/metrics",
    requireAuth,
    requireRole("admin"),
    async (_req: Request, res: Response) => {
      res.set("Content-Type", metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    },
  );

  // --- REST Routes ---
  app.use("/api/v1", (req, res, next) => {
    const sessionAction =
      req.method === "POST" && /^\/auth\/(login|logout)\/?$/.test(req.path);
    if (
      config.RECOVERY_MODE &&
      !sessionAction &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      res.status(503).json({
        error:
          "Recovery preview is read-only. Activate the installation after reviewing the restore.",
      });
      return;
    }
    next();
  });
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/share", shareRoutes);
  app.use("/api/v1", requireAuth, requireMutationAccess, requireAssetAccess);
  app.use("/api/v1/access", accessRoutes);
  app.use("/api/v1/history", historyRoutes);
  app.use("/api/v1/cmms", cmmsRoutes);
  app.use("/api/v1/energy-costs", energyCostRoutes);
  app.use("/api/v1/derived-signals", derivedSignalRoutes);
  app.use("/api/v1/widget-evidence", widgetEvidenceRoutes);
  app.use("/api/v1/planning", planningRoutes);
  app.use("/api/v1/comparisons", comparisonRoutes);
  app.use("/api/v1/configuration", configBundleRoutes);
  app.use("/api/v1/diagnostics", diagnosticsRoutes);
  app.use("/api/v1/alarm-review", alarmReviewRoutes);
  app.use("/api/v1/work-orders", workOrderRoutes);
  app.use("/api/v1/maintenance", maintenanceRoutes);
  app.use("/api/v1/quality", qualityRoutes);
  app.use("/api/v1/lines", lineRoutes);
  app.use("/api/v1/maintenance-actions", maintenanceActionRoutes);
  app.use("/api/v1/energy", energyRoutes);
  app.use("/api/v1/production", productionRoutes);
  app.use("/api/v1/production", operatorRoutes);
  app.use("/api/v1/production", inspectionRoutes);
  app.use("/api/v1/system", requireAuth, systemRoutes);
  app.use("/api/v1/dashboards", requireAuth, dashboardRoutes);
  app.use("/api/v1/opcua", requireAuth, opcuaRoutes);
  app.use("/api/v1/db", requireAuth, dbRoutes);
  app.use("/api/v1/certificates", requireAuth, certificateRoutes);
  app.use("/api/v1/status", requireAuth, statusRoutes);
  app.use("/api/v1/machines", requireAuth, requireRole("admin"), machineRoutes);
  app.use("/api/v1/operation-mode-data", requireAuth, operationModeRoutes);
  app.use(
    "/api/v1/audit-logs",
    requireAuth,
    requireRole("admin"),
    auditLogRoutes,
  );
  app.use("/api/v1/webhooks", requireAuth, requireRole("admin"), webhookRoutes);
  app.use(
    "/api/v1/custom-widgets",
    requireAuth,
    requireRole("admin"),
    customWidgetRoutes,
  );
  app.use("/api/v1/widget-runtime", requireAuth, widgetRuntimeRoutes);
  app.use("/api/v1/alarms", requireAuth, alarmRoutes);
  app.use("/api/v1/annotations", requireAuth, annotationRoutes);
  app.use("/api/v1/node-data", requireAuth, nodeDataRoutes);
  app.use("/api/v1/aggregates", requireAuth, aggregateRoutes);

  // --- Tier 1: High-Value Features ---
  app.use("/api/v1/plants", requireAuth, requireRole("admin"), plantRoutes);
  app.use("/api/v1/oee", requireAuth, oeeRoutes);
  app.use("/api/v1/alerts", requireAuth, alertEngineRoutes);
  app.use("/api/v1/trending", requireAuth, trendingRoutes);
  app.use("/api/v1/reports", requireAuth, reportRoutes);

  // --- Tier 2: Premium Features ---
  app.use(
    "/api/v1/compliance",
    requireAuth,
    requireRole("admin"),
    complianceRoutes,
  );
  app.use("/api/v1/spc", requireAuth, spcRoutes);
  if (config.COMPLIANCE_MODE_ENABLED) {
    app.use("/api/v1/recipes", requireAuth, requireRole("admin"), recipeRoutes);
    app.use("/api/v1/batches", requireAuth, requireRole("admin"), batchRoutes);
  }
  app.use("/api/v1/digital-twins", requireAuth, digitalTwinRoutes);
  app.use("/api/v1/edge", requireAuth, edgeRoutes);

  // --- tRPC API ---
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext }),
  );

  const publicDir = path.resolve("public");
  if (existsSync(path.join(publicDir, "index.html"))) {
    app.get("/embed/:token", embedFramePolicy);
    app.use(express.static(publicDir));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  // --- Centralized Error Handling ---
  app.use(errorHandler(invalidCsrfTokenError));

  return { app, sessionStore, sessionMiddleware };
}

// --- Bootstrap ---
async function bootstrap() {
  const { startConfiguredGateway } =
    await import("./src/gateway/configuredGateway.js");
  await startConfiguredGateway();
  const { app, sessionStore, sessionMiddleware } = createApp();
  const server = http.createServer(app);
  const services = createSocketServer(server, sessionStore, sessionMiddleware);

  setupOpcuaBridge(services);
  startOpcuaServices(services);

  // Start edge sync loop if in edge mode
  if (!config.RECOVERY_MODE) edgeSyncService.startSyncLoop();

  // Activate persisted report schedules
  if (!config.RECOVERY_MODE) reportSchedulerService.init();
  if (!config.RECOVERY_MODE) healthIncidentService.start();

  const shutdown = createShutdown(server, services.io);
  process.on("SIGINT", () => {
    reportSchedulerService.stop();
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    reportSchedulerService.stop();
    void shutdown("SIGTERM");
  });

  const PORT = config.PORT;
  server.listen(PORT, config.HOST, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
    if (
      statusManager.getServiceStatus(StatusConstants.DATABASE) ===
      StatusConstants.UNKNOWN
    ) {
      logger.info(
        "Server listening. Database status managed by connection attempts.",
      );
    }
    if (
      statusManager.getServiceStatus(StatusConstants.OPCUA) ===
      StatusConstants.UNKNOWN
    ) {
      logger.info(
        "Server listening. OPC UA status managed by connection attempts.",
      );
    }
  });
}

// Only start the server when this file is run directly (not imported by tests)
const isMainModule =
  process.argv[1]?.replace(/\\/g, "/").includes("app") &&
  process.env.NODE_ENV !== "test";

if (isMainModule) {
  bootstrap().catch((error) => {
    logger.error("Application startup failed", error);
    process.exit(1);
  });
}
