import type { Server, Socket } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  OpcuaNodeData,
} from "@performance-dashboard/shared";
import logger from "../../utils/logger.js";

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Handles OPC UA room management and real-time data broadcasting.
 * Clients join/leave rooms scoped by node key (and optionally machineId),
 * and receive targeted opcuaUpdate events.
 *
 * Includes delta compression: only broadcasts when value changes,
 * and includes the delta from previous value.
 */
export class OpcuaSocketService {
  private io: TypedServer;
  private lastValues = new Map<string, OpcuaNodeData>();

  constructor(io: TypedServer) {
    this.io = io;
  }

  /** Register room join/leave handlers on a connected socket */
  registerSocket(socket: TypedSocket): void {
    socket.on("joinRoom", (roomName: string) => {
      if (typeof roomName === "string" && roomName.startsWith("opcua-")) {
        const machine = /^opcua-([1-9]\d*)-.+/.exec(roomName);
        if (
          socket.data.user.role !== "admin" &&
          (!machine || !socket.data.machineIds?.includes(Number(machine[1])))
        )
          return;
        socket.join(roomName);
        logger.info(`Socket ${socket.id} joined room: ${roomName}`);
      } else {
        logger.warn(
          `Socket ${socket.id} attempted to join invalid room: ${roomName}`,
        );
      }
    });

    socket.on("leaveRoom", (roomName: string) => {
      if (typeof roomName === "string" && roomName.startsWith("opcua-")) {
        socket.leave(roomName);
        logger.info(`Socket ${socket.id} left room: ${roomName}`);
      } else {
        logger.warn(
          `Socket ${socket.id} attempted to leave invalid room: ${roomName}`,
        );
      }
    });
  }

  /** Broadcast an OPC UA node change to the appropriate rooms (with delta compression) */
  broadcastNodeChange(data: OpcuaNodeData): void {
    const cacheKey = data.machineId
      ? `${data.machineId}-${data.key}`
      : data.key;

    const previous = this.lastValues.get(cacheKey);
    const lastValue = previous?.value;

    // Quality changes must reach clients even when the raw value is unchanged.
    if (
      previous &&
      lastValue === data.value &&
      previous.statusCode === data.statusCode &&
      previous.dataType === data.dataType
    ) {
      return;
    }

    // Compute delta for numeric values
    let delta: number | null = null;
    if (typeof data.value === "number" && typeof lastValue === "number") {
      delta = data.value - lastValue;
    }

    this.lastValues.set(cacheKey, data);

    const payload: OpcuaNodeData = { ...data, delta };

    // Key-only rooms could collide with "opcua-<machine>-<key>" names, so they carry only legacy unscoped data.
    if (data.machineId) {
      this.io
        .to(`opcua-${data.machineId}-${data.key}`)
        .emit("opcuaUpdate", payload);
    } else {
      this.io.to(`opcua-${data.key}`).emit("opcuaUpdate", payload);
    }
  }
}
