import type { Server as SocketIOServer } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
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
        socket.emit("activeAlerts" as any, activeAlerts);
      } catch (err) {
        logger.error(
          "[AlertSocket] Failed to send active alerts on connection:",
          err,
        );
      }

      // Listen for acknowledge requests from client
      socket.on(
        "acknowledgeAlert" as any,
        async (data: { id: number; userId?: number }) => {
          try {
            const updated = await alertRepository.updateAlertStatus(
              data.id,
              "acknowledged",
              data.userId ?? null,
            );
            if (updated) {
              this.io.emit("alertAcknowledged" as any, updated);
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

  broadcastAlert(alert: Record<string, unknown>): void {
    this.io.emit("alertTriggered" as any, alert);
    logger.info(
      `[AlertSocket] Broadcast alertTriggered: ${alert.message ?? alert.id}`,
    );
  }
}
