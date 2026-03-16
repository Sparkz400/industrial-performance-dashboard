import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDbChain, setupServerMocks } from "../helpers/mockDb.js";

setupServerMocks();

const mockDb = createMockDbChain();
vi.mock("../../database/db.js", () => ({
  default: mockDb,
  getReadDb: () => mockDb,
  getWriteDb: () => mockDb,
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue("$2b$12$hashedpassword"),
  },
}));

import { getTestApp, getAgentWithCsrf } from "../helpers/testApp.js";

describe("Auth Routes - POST /api/v1/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.returning.mockResolvedValue([]);
    mockDb.then.mockImplementation((resolve: any) =>
      Promise.resolve([]).then(resolve),
    );
  });

  it("should return 400 if username is missing", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({ password: "secret123" });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 if password is missing", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({ username: "testuser" });

    expect(res.status).toBe(400);
  });

  it("should return 400 if body is empty", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({});

    expect(res.status).toBe(400);
  });

  it("should return 401 if user is not found", async () => {
    mockDb.then.mockImplementation((resolve: any) =>
      Promise.resolve([]).then(resolve),
    );

    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({ username: "nonexistent", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("should return 403 if user account is deactivated", async () => {
    mockDb.then.mockImplementation((resolve: any) =>
      Promise.resolve([
        {
          id: 1,
          username: "inactive",
          email: "inactive@test.com",
          passwordHash: "$2b$12$hash",
          role: "viewer",
          isActive: false,
        },
      ]).then(resolve),
    );

    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({ username: "inactive", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("should return 401 if password is invalid", async () => {
    const bcrypt = await import("bcrypt");
    (bcrypt.default.compare as any).mockResolvedValueOnce(false);

    mockDb.then.mockImplementation((resolve: any) =>
      Promise.resolve([
        {
          id: 1,
          username: "testuser",
          email: "test@test.com",
          passwordHash: "$2b$12$hash",
          role: "admin",
          isActive: true,
        },
      ]).then(resolve),
    );

    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({ username: "testuser", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("Auth Routes - POST /api/v1/auth/logout", () => {
  it("should return success on logout", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/logout")
      .set("x-csrf-token", csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Logged out");
  });
});

describe("Auth Routes - GET /api/v1/auth/me", () => {
  it("should return 401 for unauthenticated request", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("Auth Routes - POST /api/v1/auth/register", () => {
  it("should return 401 for unauthenticated request", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        username: "newuser",
        email: "new@test.com",
        password: "password123",
        role: "viewer",
      });

    expect(res.status).toBe(401);
  });
});

describe("Auth Routes - GET /api/v1/auth/users", () => {
  it("should return 401 for unauthenticated request", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/auth/users");

    expect(res.status).toBe(401);
  });
});

describe("Auth Routes - POST /api/v1/auth/change-password", () => {
  it("should return 401 for unauthenticated request", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/auth/change-password")
      .set("x-csrf-token", csrfToken)
      .send({
        currentPassword: "old12345",
        newPassword: "new12345678",
      });

    expect(res.status).toBe(401);
  });
});
