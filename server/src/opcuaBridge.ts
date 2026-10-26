import http from "http";
import type { Server as SocketServer } from "socket.io";

import { opcuaEmitter } from "./opc-ua/opcuaClient.js";
import opcuaConnectionManager from "./opc-ua/services/opcuaConnectionManager.js";
import multiMachineManager from "./opc-ua/services/multiMachineManager.js";
import opcuaQueueWorker from "./queue/opcuaQueueWorker.js";
import statusManager from "./utils/status.js";
import StatusConstants from "./utils/statusConstants.js";
import logger from "./utils/logger.js";
import dbClient from "./database/dbConnection.js";
import { shutdownTracing } from "./observability/tracing.js";
import { opcuaDataPointsReceived } from "./observability/metrics.js";

import type {
  OpcuaNodeData,
  AlarmEvent,
  SpcAlertEvent,
} from "@performance-dashboard/shared";
import alarmEvaluator, { toAlarmEvent } from "./services/alarmService.js";
import type { AlertHistoryRow } from "./database/schema.js";
import { webhookService } from "./services/webhookService.js";
import { spcService, spcEvents } from "./services/spcService.js";
import { edgeSyncService } from "./services/edgeSyncService.js";

interface Services {
  io: SocketServer;
  opcuaService: { broadcastNodeChange: (data: OpcuaNodeData) => void };
  machineService: {
    broadcastStatusChange: (data: {
      machineId: number;
      status: string;
    }) => void;
  };
  alarmService: {
    broadcastAlarmTriggered: (data: AlarmEvent) => void;
    broadcastAlarmAcknowledged: (data: AlarmEvent) => void;
    broadcastAlarmCleared: (data: AlarmEvent) => void;
  };
  spcService: { broadcastSpcAlert: (data: SpcAlertEvent) => void };
}

/** Wire OPC UA events to socket broadcasts, queue, metrics, and alarm evaluation. */
export function setupOpcuaBridge({
  io,
  opcuaService,
  alarmService,
  spcService: spcSocketService,
}: Services): void {
  // Wire alarm evaluator to socket broadcasts
  alarmEvaluator.on("alarmTriggered", (row: AlertHistoryRow) => {
    alarmService.broadcastAlarmTriggered(toAlarmEvent(row));
    io.emit("alertTriggered", {
      alertId: row.id,
      ruleId: row.ruleId,
      ruleName: row.ruleName,
      severity: row.severity,
      message: row.message,
      machineId: row.machineId,
      nodeKey: row.nodeKey,
      value: row.triggerValue,
      threshold: row.threshold,
      timestamp: row.createdAt?.toISOString(),
    });
  });
  alarmEvaluator.on("alarmCleared", (row: AlertHistoryRow) => {
    alarmService.broadcastAlarmCleared(toAlarmEvent(row));
    io.emit("alertUpdated", row);
  });
  alarmEvaluator.on("alarmAcknowledged", (row: AlertHistoryRow) => {
    alarmService.broadcastAlarmAcknowledged(toAlarmEvent(row));
    io.emit("alertAcknowledged", row);
  });
  alarmEvaluator.on("alarmUpdated", (row: AlertHistoryRow) => {
    io.emit("alertUpdated", row);
    io.emit("alarmUpdated", toAlarmEvent(row));
  });

  // Wire SPC alert events to socket broadcasts
  spcEvents.on("spcAlert", (alert: SpcAlertEvent) => {
    spcSocketService.broadcastSpcAlert(alert);
  });

  // Load alarm rules on startup
  webhookService.start();

  let acquisitionStopped = false;
  opcuaEmitter.on("nodeChanged", (data: OpcuaNodeData) => {
    if (acquisitionStopped) return;
    if (data && data.key && data.timestamp && data.value !== undefined) {
      try {
        opcuaQueueWorker.enqueue({ ...data, machineId: data.machineId });
      } catch (error) {
        acquisitionStopped = true;
        logger.error(
          "Durable storage unavailable. Stopping acquisition; unreceived intervals are unknown. Restore storage and restart the collector.",
          error,
        );
        void multiMachineManager
          .disconnectAll()
          .catch((failure) =>
            logger.error("Collector disconnect failed", failure),
          );
        void opcuaConnectionManager
          .disconnectConnection()
          .catch((failure) =>
            logger.error("Collector disconnect failed", failure),
          );
        return;
      }
      opcuaService.broadcastNodeChange(data);
      opcuaDataPointsReceived.inc({
        machine_id: String(data.machineId || "default"),
      });

      // Alarm evaluation runs from the durable queue, including unknown-quality markers.

      // SPC: fire-and-forget anomaly detection
      if (
        data.statusCode?.startsWith("Good") &&
        typeof data.value === "number"
      ) {
        spcService
          .evaluateDataPoint(data.key, data.value, data.machineId ?? undefined)
          .catch((err) => {
            logger.debug(`[SPC] Evaluation error for ${data.key}: ${err}`);
          });
      }

      // Edge: buffer data for cloud sync if in edge mode
      if (edgeSyncService.isEdgeMode()) {
        edgeSyncService
          .queueForSync(
            "opcua_data",
            "INSERT",
            `${data.key}-${data.timestamp}`,
            {
              nodeKey: data.key,
              nodeLabel: data.label,
              timestamp: data.timestamp,
              value: data.value,
              machineId: data.machineId,
              statusCode: data.statusCode,
              dataType: data.dataType,
            },
          )
          .catch((err) => {
            logger.debug(`[Edge] Queue error: ${err}`);
          });
      }

      if (
        statusManager.getServiceStatus(StatusConstants.OPCUA) ===
        StatusConstants.CONNECTED
      ) {
        statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
          ...statusManager.getServiceDetails(StatusConstants.OPCUA),
          message: "Data received",
          lastDataTimestamp: data.timestamp,
        });
      }
    } else {
      logger.warn("Received invalid nodeChanged data:", data);
    }
  });
}

/** Start queue worker and OPC UA connections. */
export async function startOpcuaServices({
  machineService,
}: Services): Promise<void> {
  opcuaQueueWorker.start();

  logger.info("Initializing multi-machine OPC UA manager...");
  try {
    await multiMachineManager.initialize();
    const connectedIds = multiMachineManager.getConnectedMachineIds();
    if (connectedIds.length > 0) {
      logger.info(
        `Multi-machine manager initialized with ${connectedIds.length} connection(s).`,
      );
    } else {
      logger.info(
        "No machines in DB. Falling back to single OPC UA connection from .env...",
      );
      await opcuaConnectionManager.startConnection().catch((err) => {
        logger.error("Initial OPC UA connection failed:", err);
      });
    }
  } catch (err) {
    logger.error(
      "Multi-machine manager initialization failed, falling back to single connection:",
      err,
    );
    await opcuaConnectionManager.startConnection().catch((connErr) => {
      logger.error("Fallback OPC UA connection also failed:", connErr);
    });
  }

  multiMachineManager.on(
    "machineStatusChanged",
    (data: { machineId: number; status: string }) => {
      machineService.broadcastStatusChange(data);
    },
  );
}

/** Gracefully shut down all services. */
export function createShutdown(
  server: http.Server,
  io: SocketServer,
): (signal: string) => Promise<void> {
  return async (signal: string): Promise<void> => {
    logger.warn(`[Shutdown] Received ${signal}. Starting graceful shutdown...`);
    statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, {
      message: "Server shutting down",
    });
    statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, {
      message: "Server shutting down",
    });

    const shutdownTimer = setTimeout(() => {
      logger.error(
        "[Shutdown] Graceful shutdown OVERALL timeout exceeded (30s). Forcing exit.",
      );
      process.exit(1);
    }, 30000);

    try {
      logger.info("[Shutdown] Closing HTTP server...");
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            logger.error("[Shutdown] Error closing HTTP server:", err);
            return reject(err);
          }
          logger.info("[Shutdown] HTTP server closed.");
          resolve();
        });
      });

      logger.info("[Shutdown] Closing WebSocket connections...");
      await new Promise<void>((resolve) => {
        io.close(() => {
          logger.info("[Shutdown] All WebSocket connections closed.");
          resolve();
        });
      });

      logger.info("[Shutdown] Disconnecting OPC UA connections...");
      await multiMachineManager.disconnectAll();
      await opcuaConnectionManager.disconnectConnection();
      await opcuaQueueWorker.stop();
      await webhookService.stop();
      edgeSyncService.stopSyncLoop();

      logger.info("[Shutdown] Closing Database pool...");
      await dbClient.end();

      logger.info("[Shutdown] Shutting down OpenTelemetry...");
      await shutdownTracing();

      logger.info("[Shutdown] Graceful shutdown sequence complete.");
      clearTimeout(shutdownTimer);
      process.exit(0);
    } catch (shutdownError) {
      logger.error(
        "[Shutdown] Error during graceful shutdown sequence:",
        shutdownError,
      );
      clearTimeout(shutdownTimer);
      process.exit(1);
    }
  };
}
