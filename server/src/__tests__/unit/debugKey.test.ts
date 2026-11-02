import { expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import config from "../../config/config.js";
const { Redis } = vi.hoisted(() => ({ Redis: vi.fn() }));
vi.mock("ioredis", () => ({ default: Redis }));
import router, { debugKeyAccepted } from "../../routes/statusRoutes.js";

it("never accepts a request when no debug key is configured", () => {
  expect(debugKeyAccepted(undefined, undefined)).toBe(false);
  expect(debugKeyAccepted("", undefined)).toBe(false);
  expect(debugKeyAccepted("anything", "")).toBe(false);
});

it("accepts only the exact configured key", () => {
  expect(debugKeyAccepted("s3cret-key", "s3cret-key")).toBe(true);
  expect(debugKeyAccepted("s3cret-kez", "s3cret-key")).toBe(false);
  expect(debugKeyAccepted("short", "s3cret-key")).toBe(false);
  expect(debugKeyAccepted(["s3cret-key"], "s3cret-key")).toBe(false);
});

it("keeps the optional Redis health probe compatible with RESP2 servers", async () => {
  const originalUrl = config.REDIS_URL;
  const ping = vi.fn().mockResolvedValue("PONG");
  const quit = vi.fn().mockResolvedValue("OK");
  Redis.mockImplementation(function (
    _url: string,
    options: { protocol?: number },
  ) {
    if (options?.protocol !== 2) throw new Error("ERR unknown command HELLO");
    return { connect: vi.fn().mockResolvedValue(undefined), ping, quit };
  });
  config.REDIS_URL = "redis://127.0.0.1:6379";
  try {
    const app = express();
    app.use(router);
    const response = await request(app).get("/health");
    expect(response.body.checks.redis.status).toBe("ok");
    expect(ping).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  } finally {
    config.REDIS_URL = originalUrl;
    Redis.mockReset();
  }
});
