import type { Server } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  SystemStatus,
} from "@performance-dashboard/shared";
import statusManager from "../../utils/status.js";
import logger from "../../utils/logger.js";

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Handles system status broadcasting over Socket.io.
 * Listens on the statusManager for changes and pushes updates to all connected clients.
 */
export class StatusSocketService {
  private io: TypedServer;

  constructor(io: TypedServer) {
    this.io = io;
  }

  /** Register status change listener and broadcast to all clients */
  register(): void {
    statusManager.on("statusChanged", () => {
      logger.info("[WebSocket] Broadcasting status update to clients.");
      const fullStatus = statusManager.getFullStatus() as SystemStatus;
      this.io.emit("statusUpdate", fullStatus);
    });
  }

  /** Send current status to a specific socket (e.g. on connect) */
  sendCurrentStatus(socketId: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return;

    try {
      const currentStatus = statusManager.getFullStatus() as SystemStatus;
      logger.info(
        `[WebSocket] Sending current status to newly connected client ${socketId}`,
      );
      socket.emit("statusUpdate", currentStatus);
    } catch (error) {
      logger.error(
        `[WebSocket] Failed to send initial status to ${socketId}:`,
        error,
      );
    }
  }
}
