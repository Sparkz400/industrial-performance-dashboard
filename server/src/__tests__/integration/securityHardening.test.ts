import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockDbChain } from "../helpers/mockDb.js";
import express from "express";
import request from "supertest";

vi.mock("../../database/db.js", async () => {
  const { createMockDbChain } = await import("../helpers/mockDb.js");
  const chain = createMockDbChain();
  return { default: chain, getReadDb: () => chain, getWriteDb: () => chain };
});
import db from "../../database/db.js";
const mockDb = db as unknown as ReturnType<typeof createMockDbChain>;
import config from "../../config/config.js";
import { setupMiddleware } from "../../middleware/setupMiddleware.js";
import { getAgentWithCsrf } from "../helpers/testApp.js";
import { createContext } from "../../trpc/trpc.js";
import { appRouter } from "../../trpc/index.js";
import { newPasswordSchema } from "../../utils/password.js";
import { getAuditActor } from "../../services/auditLogService.js";
import {
  getComplianceActor,
  complianceService,
} from "../../services/complianceService.js";
import dashboardRoutes from "../../routes/dashboardRoutes.js";
import { dashboardService } from "../../services/dashboardService.js";

const originalUrl = config.CLIENT_URL;
afterEach(() => {
  config.CLIENT_URL = originalUrl;
  config.TRUSTED_PROXIES = "";
  vi.restoreAllMocks();
});

describe("security boundaries", () => {
  it("limits repeated password guesses for an account and leaves other accounts usable", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await agent
        .post("/api/v1/auth/login")
        .set("x-csrf-token", csrfToken)
        .send({ username: "rate-limit-fixture", password: "wrong-password" });
      expect(response.status).toBe(401);
    }
    const blocked = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({ username: "rate-limit-fixture", password: "wrong-password" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(
      (
        await agent
          .post("/api/v1/auth/login")
          .set("x-csrf-token", csrfToken)
          .send({ username: "other-fixture", password: "wrong-password" })
      ).status,
    ).toBe(401);
  }, 15000);

  it("accepts secure cookies only through explicitly trusted proxies", async () => {
    config.CLIENT_URL = "https://dashboard.example.invalid";
    const untrusted = express();
    setupMiddleware(untrusted);
    expect(
      (
        await request(untrusted)
          .get("/api/v1/csrf-token")
          .set("X-Forwarded-Proto", "https")
      ).status,
    ).toBe(426);

    config.TRUSTED_PROXIES = "127.0.0.1,::1";
    const trusted = express();
    setupMiddleware(trusted);
    expect((await request(trusted).get("/api/v1/csrf-token")).status).toBe(426);
    const secure = await request(trusted)
      .get("/api/v1/csrf-token")
      .set("X-Forwarded-Proto", "https");
    expect(secure.status).toBe(200);
    const cookie = String(secure.headers["set-cookie"]);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(secure.headers["cache-control"]).toBe("no-store");
    expect(secure.headers["content-security-policy"]).not.toMatch(
      /(?:http|ws):\/\//,
    );
    expect(secure.headers["strict-transport-security"]).toBeTruthy();
  });

  it("keeps the identity-provider session age in tRPC and rejects an expired session", async () => {
    const ctx = createContext({
      req: {
        session: {
          userId: 1,
          userVersion: "fixture",
          userRole: "admin",
          oidcAuthTime: Date.now() - 25 * 3600_000,
        },
      },
    } as never);
    expect(ctx.session.oidcAuthTime).toBeTypeOf("number");
    await expect(
      appRouter.createCaller(ctx).dashboard.list(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("bounds new passwords by UTF-8 bytes, including the seed password", () => {
    expect(newPasswordSchema.validate("a".repeat(72)).error).toBeUndefined();
    expect(newPasswordSchema.validate("é".repeat(36)).error).toBeUndefined();
    expect(newPasswordSchema.validate("é".repeat(37)).error).toBeDefined();
    expect(newPasswordSchema.validate("a".repeat(73)).error).toBeDefined();
    expect(newPasswordSchema.validate("short").error).toBeDefined();
  });

  it("does not trust a client-supplied forwarded address in audit records", () => {
    const req = {
      headers: { "x-forwarded-for": "203.0.113.25" },
      ip: "127.0.0.1",
    } as never;
    expect(getAuditActor(req).ipAddress).toBe("127.0.0.1");
    expect(getComplianceActor(req).ipAddress).toBe("127.0.0.1");
  });

  it("does not let a body ID redirect a dashboard write", async () => {
    vi.spyOn(complianceService, "recordComplianceEvent").mockResolvedValue(
      undefined as never,
    );
    const save = vi
      .spyOn(dashboardService, "saveDashboard")
      .mockResolvedValue({ id: "path-dashboard", name: "Test" } as never);
    vi.spyOn(dashboardService, "getDashboardById").mockRejectedValue(
      new Error("missing"),
    );
    const app = express();
    app.use(express.json());
    app.use(dashboardRoutes);
    const result = await request(app)
      .post("/path-dashboard")
      .send({ id: "other-dashboard", name: "Test" });
    expect(result.status).toBe(200);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "path-dashboard" }),
    );
  });
});
