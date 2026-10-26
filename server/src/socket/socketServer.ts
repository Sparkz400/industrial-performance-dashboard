import http from "http";
import type { Request, Response } from "express";
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
import { getSessionUser, sessionEvents } from "../services/sessionAccess.js";
import {
  accessScope,
  loadAccessScope,
  assertResource,
  canOperate,
} from "../services/accessScope.js";
import alarmEvaluator from "../services/alarmService.js";

import { StatusSocketService } from "./services/StatusSocketService.js";
import { OpcuaSocketService } from "./services/OpcuaSocketService.js";
import { CertificateSocketService } from "./services/CertificateSocketService.js";
import { MachineSocketService } from "./services/MachineSocketService.js";
import { AlarmSocketService } from "./services/AlarmSocketService.js";
import { SpcSocketService } from "./services/SpcSocketService.js";

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
  spcService: SpcSocketService;
}

export function createSocketServer(
  server: http.Server,
  sessionStore: PgSessionStore,
  sharedSessionMiddleware?: ReturnType<typeof session>,
): SocketServices {
  const io: TypedServer = new SocketIOServer(server, {
    // WebSocket handshakes are not protected by browser CORS enforcement.
    allowRequest: (request, callback) => {
      callback(
        null,
        request.headers.origin === undefined ||
          request.headers.origin === new URL(config.CLIENT_URL).origin,
      );
    },
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
  const spcSocketService = new SpcSocketService(io);

  // Register global status broadcasting
  statusService.register();

  // --- Socket.IO Authentication Middleware ---
  // One middleware instance per server; constructing it per handshake leaks store listeners.
  const sessionMiddleware =
    sharedSessionMiddleware ??
    session({
      store: sessionStore,
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 2 * 60 * 60 * 1000,
        secure: new URL(config.CLIENT_URL).protocol === "https:",
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    });
  io.use((socket, next) => {
    // Socket.IO passes an IncomingMessage; Express middleware expects Request/Response
    const req = socket.request as unknown as Request;
    const res = Object.create(null) as Response;

    cookieParser(config.COOKIE_SECRET)(req, res, (cookieErr?: unknown) => {
      if (cookieErr) {
        logger.error("Socket.IO Cookie parsing error:", cookieErr);
        return next(new Error("Authentication error: Invalid cookies"));
      }

      sessionMiddleware(req, res, (sessionErr?: unknown) => {
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

        void getSessionUser(req.session)
          .then(async (user) => {
            if (
              !user ||
              !req.session.cookie.expires ||
              new Date(req.session.cookie.expires).getTime() <= Date.now()
            )
              return next(new Error("Authentication required"));
            socket.data.user = {
              authenticated: true,
              id: user.id,
              username: req.session.username ?? "",
              role: user.role,
            };
            const scope = await loadAccessScope(user.id, user.role);
            socket.data.machineIds = scope.machineIds;
            if (user.role === "admin") await socket.join("access:admin");
            else
              for (const id of scope.machineIds)
                await socket.join(`access:machine:${id}`);

            logger.info(
              `Socket.IO: Authenticated user "${req.session.username}" (${socket.id}).`,
            );
            next();
          })
          .catch(next);
      });
    });
  });

  const revokeSession = (id: string) =>
    io.in(`session:${id}`).disconnectSockets(true);
  const revokeUser = (id: number) =>
    io.in(`user:${id}`).disconnectSockets(true);
  sessionEvents.on("sessionRevoked", revokeSession);
  sessionEvents.on("userRevoked", revokeUser);
  io.engine.on("close", () => {
    sessionEvents.off("sessionRevoked", revokeSession);
    sessionEvents.off("userRevoked", revokeUser);
  });

  // --- Connection Handler ---
  io.on("connection", (socket) => {
    const req = socket.request as Request;
    void socket.join(`session:${req.sessionID}`);
    void socket.join(`user:${socket.data.user.id}`);
    const expiresAt = new Date(req.session.cookie.expires!).getTime();
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, Math.min(2147483647, expiresAt - Date.now())),
    );
    const validate = async () => {
      await new Promise<void>((resolve, reject) =>
        req.session.reload((error) => (error ? reject(error) : resolve())),
      );
      const user = await getSessionUser(req.session);
      if (
        !user ||
        user.role !== socket.data.user.role ||
        Date.now() >= expiresAt
      )
        throw new Error("Session revoked");
    };
    let checking = false;
    const check = setInterval(() => {
      if (checking) return;
      checking = true;
      void validate()
        .catch(() => socket.disconnect(true))
        .finally(() => {
          checking = false;
        });
    }, 1000);
    socket.use((_packet, next) => {
      void validate()
        .then(() => next())
        .catch(() => {
          socket.disconnect(true);
          next(new Error("Authentication required"));
        });
    });
    socket.on("acknowledgeAlert", async ({ id }) => {
      if (config.RECOVERY_MODE || !canOperate(socket.data.user.role)) return;
      if (!Number.isSafeInteger(id) || id <= 0) return;
      try {
        const user = await getSessionUser(req.session);
        if (!user) return;
        const scope = await loadAccessScope(user.id, user.role);
        await accessScope.run(scope, async () => {
          await assertResource("alarm", id);
          await alarmEvaluator.acknowledge(id, user.id);
        });
      } catch (error) {
        logger.error("Alarm acknowledgment failed", error);
      }
    });
    socket.on("disconnect", () => {
      clearTimeout(expiry);
      clearInterval(check);
    });
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
    spcService: spcSocketService,
  };
}
