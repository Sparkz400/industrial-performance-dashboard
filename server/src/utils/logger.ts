import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const { combine, timestamp, json, colorize, simple, printf } = winston.format;

// Custom format that includes request ID
const requestIdFormat = printf(
  ({ level, message, timestamp, requestId, ...rest }) => {
    const rid = requestId ? `[${requestId}]` : "";
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
    return `${timestamp} ${level} ${rid} ${message}${extra}`;
  },
);

interface LoggerWithMiddleware extends winston.Logger {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp(), json()),
  transports: [
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      level: "error",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d",
    }),
    new DailyRotateFile({
      filename: "logs/combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "50m",
      maxFiles: "30d",
    }),
  ],
}) as LoggerWithMiddleware;

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: combine(colorize(), simple()),
    }),
  );
}

/**
 * Generate a unique request ID
 */
export const generateRequestId = (): string => crypto.randomUUID();

/**
 * Express middleware to assign a request ID and log incoming requests.
 */
logger.middleware = (req: Request, res: Response, next: NextFunction): void => {
  (req as any).requestId =
    (req.headers["x-request-id"] as string) || generateRequestId();
  res.setHeader("x-request-id", (req as any).requestId);

  logger.info({
    message: `${req.method} ${req.url}`,
    requestId: (req as any).requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
  next();
};

export default logger;
