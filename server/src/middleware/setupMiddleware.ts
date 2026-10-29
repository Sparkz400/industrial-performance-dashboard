import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import cookieParser from "cookie-parser";
import { csrfSync } from "csrf-sync";
import helmet from "helmet";
import compression from "compression";

import dbClient from "../database/dbConnection.js";
import { rateLimiter } from "./security.js";
import logger from "../utils/logger.js";
import { CSRF_HEADER_NAME } from "../utils/csrf.js";
import config from "../config/config.js";
import { customWidgetService } from "../services/customWidgetService.js";

const pgSession = connectPgSimple(session);

export interface MiddlewareContext {
  sessionStore: InstanceType<typeof pgSession>;
  sessionMiddleware: ReturnType<typeof session>;
  invalidCsrfTokenError: unknown;
}

export function setupMiddleware(app: express.Application): MiddlewareContext {
  app.use(
    cors({
      origin: config.CLIENT_URL,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          // Only registered, active custom-widget entry pages may be framed.
          "frame-src": ["'self'", () => customWidgetService.frameSources()],
          "connect-src": [
            "'self'",
            config.CLIENT_URL,
            `ws://${new URL(config.CLIENT_URL).hostname}:3000`,
            `http://${new URL(config.CLIENT_URL).hostname}:3000`,
          ],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
  app.use(rateLimiter);
  app.use(compression());
  app.use(express.json());
  app.use(logger.middleware);

  // --- Session ---
  if (!process.env.SESSION_SECRET) {
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "FATAL ERROR: SESSION_SECRET is not set. Refusing to start in production without a secure session secret.",
      );
      process.exit(1);
    }
    logger.warn(
      "SESSION_SECRET not set in .env file. Using insecure default. Set a strong secret before deploying to production!",
    );
  }

  const sessionStore = new pgSession({
    pool: dbClient.pool,
    tableName: "session",
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60,
    ttl: 60 * 60 * 2,
  });

  const sessionMiddleware = session({
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
  app.use(sessionMiddleware);

  app.set("etag", "strong");
  app.disable("x-powered-by");

  // --- Cookie Parser ---
  if (!config.COOKIE_SECRET) {
    logger.error("FATAL ERROR: COOKIE_SECRET environment variable is not set.");
    process.exit(1);
  }
  app.use(cookieParser(config.COOKIE_SECRET));

  // --- CSRF Protection ---
  const {
    generateToken,
    getTokenFromRequest,
    csrfSynchronisedProtection,
    invalidCsrfTokenError,
  } = csrfSync({
    getTokenFromRequest: (req) => {
      return (req.headers[CSRF_HEADER_NAME] as string) || req.body?._csrf;
    },
    getTokenFromState: (req) => {
      return req.session?.csrfToken;
    },
    storeTokenInState: (req, token) => {
      req.session.csrfToken = token;
    },
    size: 64,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }
    // Keep the session-token match explicit at the route boundary for static analysis.
    if (req.session.csrfToken !== getTokenFromRequest(req)) {
      return next(invalidCsrfTokenError);
    }
    csrfSynchronisedProtection(req, res, next);
  });

  app.get("/api/v1/csrf-token", (req: Request, res: Response) => {
    let token = req.session.csrfToken;
    if (!token) {
      token = generateToken(req);
      logger.info(`[CSRF Token Gen] New token for session ${req.sessionID}`);
    }
    // Explicitly save session before responding so the token is persisted
    // to the store before the client can fire a POST with it.
    req.session.save((err) => {
      if (err) {
        logger.error("[CSRF] Failed to save session:", err);
        return res.status(500).json({ error: "Session save failed" });
      }
      res.json({ csrfToken: token });
    });
  });

  return { sessionStore, sessionMiddleware, invalidCsrfTokenError };
}
