import http from "http";
import type { Server as SocketServer } from "socket.io";

import { opcuaEmitter } from "./opc-ua/opcuaClient.js";
import opcuaConnectionManager from "./opc-ua/services/opcuaConnectionManager.js";
import multiMachineManager from "./opc-ua/services/multiMachineManager.js";
import opcuaQueueWorker from "./queue/opcuaQueueWorker.js";
import statusManager from "./utils/status.js";
import StatusConstants from "./utils/statusConstants.js";
import logger from "./utils/logger.js";
import config from "./config/config.js";
import dbClient from "./database/dbConnection.js";
import { machineRepository } from "./repositories/machineRepository.js";
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
import { healthIncidentService } from "./services/healthIncidentService.js";
import { stopConfiguredGateway } from "./gateway/configuredGateway.js";
import { mqttIngestion } from "./services/mqttIngestion.js";
import { plcAlarms } from "./services/plcAlarms.js";
import {
  acquireCollectorLock,
  releaseCollectorLock,
} from "./services/collectorLock.js";

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
    broadcastAlarmUpdated: (data: AlarmEvent) => void;
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
  // Alarm events go only to administrators and accounts granted the alarm's machine.
  alarmEvaluator.on("alarmTriggered", (row: AlertHistoryRow) => {
    alarmService.broadcastAlarmTriggered(toAlarmEvent(row));
  });
  alarmEvaluator.on("alarmCleared", (row: AlertHistoryRow) => {
    alarmService.broadcastAlarmCleared(toAlarmEvent(row));
  });
  alarmEvaluator.on("alarmAcknowledged", (row: AlertHistoryRow) => {
    alarmService.broadcastAlarmAcknowledged(toAlarmEvent(row));
  });
  alarmEvaluator.on("alarmUpdated", (row: AlertHistoryRow) => {
    alarmService.broadcastAlarmUpdated(toAlarmEvent(row));
  });

  // Wire SPC alert events to socket broadcasts
  spcEvents.on("spcAlert", (alert: SpcAlertEvent) => {
    spcSocketService.broadcastSpcAlert(alert);
  });

  // Load alarm rules on startup
  if (!config.RECOVERY_MODE) webhookService.start();

  let acquisitionStopped = false;
  opcuaEmitter.on("nodeChanged", (data: OpcuaNodeData) => {
    if (acquisitionStopped) return;
    if (data && data.key && data.timestamp && data.value !== undefined) {
      try {
        if (!data.alreadySpooled)
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

      // SPC: fire-and-forget; a bad sample is passed too, so it breaks the window.
      if (
        typeof data.value === "number" ||
        !data.statusCode?.startsWith("Good")
      ) {
        spcService
          .evaluateDataPoint(
            data.key,
            typeof data.value === "number" ? data.value : null,
            data.machineId ?? undefined,
            data.timestamp,
            data.statusCode ?? "Uncertain",
          )
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
  if (config.RECOVERY_MODE) return;
  opcuaQueueWorker.start();

  multiMachineManager.on(
    "machineStatusChanged",
    (data: { machineId: number; status: string }) => {
      machineService.broadcastStatusChange(data);
    },
  );
  const lockIncident = (held: boolean) =>
    alarmEvaluator
      .observeHealth(
        "collector-lock",
        null,
        !held,
        "Second collector",
        "Another collector holds this database's collector lock; this instance does not connect to machines.",
      )
      .catch((error) => logger.warn("Collector lock incident failed", error));
  const stopCollecting = () => {
    void mqttIngestion
      .stopAll()
      .catch((error) => logger.error("MQTT disconnect failed", error));
    void plcAlarms
      .stopAll()
      .catch((error) => logger.error("PLC alarm disconnect failed", error));
    void multiMachineManager
      .disconnectAll()
      .catch((error) => logger.error("Collector disconnect failed", error));
    void opcuaConnectionManager
      .disconnectConnection()
      .catch((error) => logger.error("Collector disconnect failed", error));
    void lockIncident(false);
  };
  // A restart may find the old process's session not yet reaped; wait instead of giving up.
  while (!(await acquireCollectorLock(stopCollecting).catch(() => false))) {
    logger.error(
      "Another collector holds this database's collector lock. Machines stay disconnected; retrying in 5 seconds.",
    );
    await lockIncident(false);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  await lockIncident(true);

  logger.info("Initializing multi-machine OPC UA manager...");
  try {
    await multiMachineManager.initialize();
    const connectedIds = multiMachineManager.getConnectedMachineIds();
    if (connectedIds.length > 0) {
      logger.info(
        `Multi-machine manager initialized with ${connectedIds.length} connection(s).`,
      );
    } else if ((await machineRepository.listMachines()).length === 0) {
      logger.info(
        "No machines in DB. Starting single OPC UA connection from .env...",
      );
      await opcuaConnectionManager.startConnection().catch((err) => {
        logger.error("Initial OPC UA connection failed:", err);
      });
    }
  } catch (err) {
    logger.error(
      "Multi-machine manager initialization failed; configured machines remain disconnected:",
      err,
    );
  }
  // MQTT subscribers belong to the collector holding the lock, like OPC UA sessions.
  await mqttIngestion
    .startAll()
    .catch((err) =>
      logger.error("MQTT sources not started; they remain disconnected:", err),
    );
  await plcAlarms
    .startAll()
    .catch((err) => logger.error("PLC alarm observation not started:", err));
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
      await mqttIngestion.stopAll();
      await plcAlarms.stopAll();
      await multiMachineManager.disconnectAll();
      await opcuaConnectionManager.disconnectConnection();
      await stopConfiguredGateway();
      await healthIncidentService.stop();
      await opcuaQueueWorker.stop();
      await webhookService.stop();
      edgeSyncService.stopSyncLoop();
      await releaseCollectorLock().catch((error) =>
        logger.warn("[Shutdown] Collector lock release failed", error),
      );

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
