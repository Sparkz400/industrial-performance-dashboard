import type { Server } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  MachineStatusUpdate,
} from "@performance-dashboard/shared";

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Handles machine connection status broadcasting.
 * Forwards machineStatusChanged events from the multi-machine manager
 * to all connected clients.
 */
export class MachineSocketService {
  private io: TypedServer;

  constructor(io: TypedServer) {
    this.io = io;
  }

  /** Broadcast a machine status change to all clients */
  broadcastStatusChange(data: MachineStatusUpdate): void {
    this.io.emit("machineStatusUpdate", data);
  }
}
