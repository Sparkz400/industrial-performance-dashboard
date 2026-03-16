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

const pgSession = connectPgSimple(session);

export interface MiddlewareContext {
  sessionStore: InstanceType<typeof pgSession>;
  invalidCsrfTokenError: any;
}

export function setupMiddleware(app: express.Application): MiddlewareContext {
  app.use(
    cors({
      origin: config.CLIENT_URL,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || "fallback-insecure-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    }),
  );

  app.set("etag", "strong");
  app.disable("x-powered-by");

  // --- Cookie Parser ---
  if (!config.COOKIE_SECRET) {
    logger.error("FATAL ERROR: COOKIE_SECRET environment variable is not set.");
    process.exit(1);
  }
  app.use(cookieParser(config.COOKIE_SECRET));

  // --- CSRF Protection ---
  const { generateToken, csrfSynchronisedProtection, invalidCsrfTokenError } =
    csrfSync({
      getTokenFromRequest: (req) => {
        return (req.headers[CSRF_HEADER_NAME] as string) || req.body?._csrf;
      },
      getTokenFromState: (req) => {
        return (req as any).session?.csrfToken;
      },
      storeTokenInState: (req, token) => {
        (req as any).session.csrfToken = token;
      },
      size: 64,
    });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }
    csrfSynchronisedProtection(req, res, next);
  });

  app.get("/api/v1/csrf-token", (req: Request, res: Response) => {
    let token = (req.session as any).csrfToken;
    if (!token) {
      token = generateToken(req);
      logger.info(`[CSRF Token Gen] New token for session ${req.sessionID}`);
    }
    res.json({ csrfToken: token });
  });

  return { sessionStore, invalidCsrfTokenError };
}
