import type { Socket } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  CertificateNotification,
} from "@performance-dashboard/shared";
import opcuaConnectionManager from "../../opc-ua/services/opcuaConnectionManager.js";
import logger from "../../utils/logger.js";

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Handles OPC UA certificate trust management for admin sockets.
 * Forwards untrusted certificate notifications to admin clients and processes
 * acceptance requests.
 */
export class CertificateSocketService {
  /** Register certificate handlers on an admin socket */
  registerSocket(socket: TypedSocket): void {
    if (socket.data.user?.role !== "admin") return;

    logger.info(
      `Admin client ${socket.id} connected, enabling certificate management.`,
    );

    const untrustedHandler = (certInfo: CertificateNotification): void => {
      try {
        logger.debug(
          `Sending untrustedCertificate event to admin client: ${socket.id}`,
        );
        socket.emit("untrustedCertificate", certInfo);
      } catch (emitError) {
        logger.error(
          `Failed to emit untrustedCertificate to ${socket.id}:`,
          emitError,
        );
      }
    };

    opcuaConnectionManager.on("untrustedCertificate", untrustedHandler);

    socket.on("acceptCertificate", async (filename: string) => {
      try {
        const result = await opcuaConnectionManager.acceptCertificate(filename);
        socket.emit("certificateAccepted", {
          success: result,
          filename,
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          `Error processing acceptCertificate from ${socket.id} for ${filename}:`,
          error,
        );
        socket.emit("certificateAccepted", {
          success: false,
          filename,
          error: message,
        });
      }
    });

    socket.on("disconnect", () => {
      opcuaConnectionManager.off("untrustedCertificate", untrustedHandler);
      logger.info(
        `Admin client ${socket.id} disconnected, certificate listeners removed.`,
      );
    });
  }
}
