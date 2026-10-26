import type { Server as SocketIOServer } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  SpcAlertEvent,
} from "@performance-dashboard/shared";
import logger from "../../utils/logger.js";

type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export class SpcSocketService {
  private io: TypedServer;

  constructor(io: TypedServer) {
    this.io = io;
  }

  broadcastSpcAlert(alert: SpcAlertEvent): void {
    this.io
      .to(
        alert.machineId == null
          ? ["access:admin"]
          : ["access:admin", `access:machine:${alert.machineId}`],
      )
      .emit("spcAlert", alert);
    logger.info(
      `[SpcSocket] Broadcast spcAlert: ${alert.alertType} on profile ${alert.profileId}`,
    );
  }
}
