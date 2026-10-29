import type { Server as SocketIOServer } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  AlarmEvent,
} from "@performance-dashboard/shared";
import logger from "../../utils/logger.js";

type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export class AlarmSocketService {
  private io: TypedServer;

  constructor(io: TypedServer) {
    this.io = io;
  }

  broadcastAlarmTriggered(alarm: AlarmEvent): void {
    this.io
      .to(
        alarm.machineId == null
          ? ["access:admin"]
          : ["access:admin", `access:machine:${alarm.machineId}`],
      )
      .emit("alarmTriggered", alarm);
    logger.info(`[AlarmSocket] Broadcast alarmTriggered: ${alarm.message}`);
  }

  broadcastAlarmAcknowledged(alarm: AlarmEvent): void {
    this.io
      .to(
        alarm.machineId == null
          ? ["access:admin"]
          : ["access:admin", `access:machine:${alarm.machineId}`],
      )
      .emit("alarmAcknowledged", alarm);
    logger.info(`[AlarmSocket] Broadcast alarmAcknowledged: id=${alarm.id}`);
  }

  broadcastAlarmUpdated(alarm: AlarmEvent): void {
    this.io
      .to(
        alarm.machineId == null
          ? ["access:admin"]
          : ["access:admin", `access:machine:${alarm.machineId}`],
      )
      .emit("alarmUpdated", alarm);
  }

  broadcastAlarmCleared(alarm: AlarmEvent): void {
    this.io
      .to(
        alarm.machineId == null
          ? ["access:admin"]
          : ["access:admin", `access:machine:${alarm.machineId}`],
      )
      .emit("alarmCleared", alarm);
    logger.info(`[AlarmSocket] Broadcast alarmCleared: id=${alarm.id}`);
  }
}
