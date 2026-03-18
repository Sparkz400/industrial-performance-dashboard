import type { Server as SocketIOServer } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  AcknowledgeAlertPayload,
  AlertNotification,
} from "@performance-dashboard/shared";
import { alertRepository } from "../../repositories/alertRepository.js";
import logger from "../../utils/logger.js";

type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export class AlertSocketService {
  private io: TypedServer;

  constructor(io: TypedServer) {
    this.io = io;
    this.init();
  }

  private init(): void {
    this.io.on("connection", async (socket) => {
      // Send recent active alerts on connection
      try {
        const activeAlerts = await alertRepository.listAlertHistory({
          status: "active",
          limit: 50,
        });
        // DB rows use Date objects; shared types use ISO strings — bridged at the serialization layer
        socket.emit("activeAlerts", activeAlerts as unknown as Parameters<ServerToClientEvents["activeAlerts"]>[0]);
      } catch (err) {
        logger.error(
          "[AlertSocket] Failed to send active alerts on connection:",
          err,
        );
      }

      // Listen for acknowledge requests from client
      socket.on(
        "acknowledgeAlert",
        async (data: AcknowledgeAlertPayload) => {
          try {
            const updated = await alertRepository.updateAlertStatus(
              data.id,
              "acknowledged",
              data.userId ?? null,
            );
            if (updated) {
              this.io.emit("alertAcknowledged", updated as unknown as Parameters<ServerToClientEvents["alertAcknowledged"]>[0]);
              logger.info(
                `[AlertSocket] Alert ${data.id} acknowledged by user ${data.userId}`,
              );
            }
          } catch (err) {
            logger.error(
              `[AlertSocket] Failed to acknowledge alert ${data.id}:`,
              err,
            );
          }
        },
      );
    });
  }

  broadcastAlert(alert: AlertNotification): void {
    this.io.emit("alertTriggered", alert);
    logger.info(
      `[AlertSocket] Broadcast alertTriggered: ${alert.message ?? alert.alertId}`,
    );
  }
}
