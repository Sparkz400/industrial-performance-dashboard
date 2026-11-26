import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import config from "../config/config.js";
import { PostgresRateLimitStore } from "./postgresRateLimitStore.js";

export const credentialRateLimit = [
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    store: new PostgresRateLimitStore("login-total"),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again later." },
  }),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    store: new PostgresRateLimitStore("login-ip"),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again later." },
  }),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    store: new PostgresRateLimitStore("login-account"),
    keyGenerator: (req) =>
      createHash("sha256")
        .update(
          req.path === "/change-password" && req.session?.userId
            ? `user:${req.session.userId}`
            : `login:${String(req.body?.username ?? "")
                .trim()
                .toLowerCase()}`,
        )
        .digest("hex"),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again later." },
  }),
];

/**
 * E-signature password checks, per signed-in account and in their own bucket, so routine
 * signing never uses up the plant's shared sign-in allowance. A wrong password answers
 * 200 {verified:false}, so failures are recognised from res.locals, not the status code.
 */
export const signatureRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: new PostgresRateLimitStore("signature-account"),
  keyGenerator: (req) =>
    createHash("sha256")
      .update(`user:${req.session?.userId ?? "anonymous"}`)
      .digest("hex"),
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: Request, res: Response) =>
    res.statusCode < 400 && res.locals.credentialRejected !== true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signature attempts. Try again later." },
});

export const rateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path === "/healthz" &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress ?? "",
    ),
});
