import http from "http";
import session from "express-session";
import cookieParser from "cookie-parser";
import { Server as SocketIOServer } from "socket.io";

import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "@performance-dashboard/shared";

import logger from "../utils/logger.js";
import connectionTracker from "../utils/connectionTracker.js";
import config from "../config/config.js";

import { StatusSocketService } from "./services/StatusSocketService.js";
import { OpcuaSocketService } from "./services/OpcuaSocketService.js";
import { CertificateSocketService } from "./services/CertificateSocketService.js";
import { MachineSocketService } from "./services/MachineSocketService.js";
import { AlarmSocketService } from "./services/AlarmSocketService.js";

import type connectPgSimple from "connect-pg-simple";

type PgSessionStore = InstanceType<ReturnType<typeof connectPgSimple>>;
type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface SocketServices {
  io: TypedServer;
  statusService: StatusSocketService;
  opcuaService: OpcuaSocketService;
  certificateService: CertificateSocketService;
  machineService: MachineSocketService;
  alarmService: AlarmSocketService;
}

export function createSocketServer(
  server: http.Server,
  sessionStore: PgSessionStore,
): SocketServices {
  const io: TypedServer = new SocketIOServer(server, {
    cors: {
      origin: config.CLIENT_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
    perMessageDeflate: {
      threshold: 1024,
      zlibDeflateOptions: { level: 6 },
    },
  });

  // --- Instantiate service classes ---
  const statusService = new StatusSocketService(io);
  const opcuaService = new OpcuaSocketService(io);
  const certificateService = new CertificateSocketService();
  const machineService = new MachineSocketService(io);
  const alarmService = new AlarmSocketService(io);

  // Register global status broadcasting
  statusService.register();

  // --- Socket.IO Authentication Middleware ---
  io.use((socket, next) => {
    const req = socket.request as any;
    const res = {} as any;

    cookieParser(config.COOKIE_SECRET)(req, res, (cookieErr?: any) => {
      if (cookieErr) {
        logger.error("Socket.IO Cookie parsing error:", cookieErr);
        return next(new Error("Authentication error: Invalid cookies"));
      }

      const sessionMiddleware = session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET || "fallback-insecure-secret",
        resave: false,
        saveUninitialized: false,
      });

      sessionMiddleware(req, res, (sessionErr?: any) => {
        if (sessionErr) {
          logger.error("Socket.IO Session parsing error:", sessionErr);
          return next(new Error("Authentication error: Invalid session"));
        }

        if (!req.session?.userId) {
          logger.warn(
            `Socket.IO: Unauthenticated connection attempt for ${socket.id}. Rejecting.`,
          );
          return next(new Error("Authentication required"));
        }

        socket.data.user = {
          authenticated: true,
          id: req.session.userId,
          username: req.session.username,
          role: req.session.userRole,
        };

        logger.info(
          `Socket.IO: Authenticated user "${req.session.username}" (${socket.id}).`,
        );
        next();
      });
    });
  });

  // --- Connection Handler ---
  io.on("connection", (socket) => {
    const clientIp =
      socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
    const clientInfo = {
      ip: clientIp as string,
      userAgent: socket.handshake.headers["user-agent"],
      query: socket.handshake.query as Record<string, string>,
      connectedAt: new Date(),
    };

    connectionTracker.addConnection(socket.id, clientInfo);

    if (!socket.data.user?.authenticated) {
      logger.warn(
        `Unauthenticated socket ${socket.id} connected despite middleware. Disconnecting.`,
      );
      return socket.disconnect(true);
    }

    logger.info(
      `Client connected via WebSocket: ${socket.id} from ${clientIp}`,
    );

    // Delegate to service classes
    statusService.sendCurrentStatus(socket.id);
    opcuaService.registerSocket(socket);
    certificateService.registerSocket(socket);

    if (socket.data.user?.role !== "admin") {
      logger.info(`Non-admin client ${socket.id} connected.`);
    }

    socket.on("disconnect", (reason: string) => {
      connectionTracker.removeConnection(socket.id);
      logger.info(`Client disconnected: ${socket.id}, Reason: ${reason}`);
    });

    socket.on("error", (error: Error) => {
      logger.error(`WebSocket error for client ${socket.id}:`, error);
    });
  });

  return {
    io,
    statusService,
    opcuaService,
    certificateService,
    machineService,
    alarmService,
  };
}
