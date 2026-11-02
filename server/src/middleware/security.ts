import rateLimit from "express-rate-limit";
import { createHash } from "node:crypto";
import config from "../config/config.js";

// shortcut: counters are per process; multiple replicas need a shared perimeter login limit.
export const credentialRateLimit = [
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again later." },
  }),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
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
