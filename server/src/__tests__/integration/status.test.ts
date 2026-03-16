import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDbChain, setupServerMocks } from "../helpers/mockDb.js";

// Set up all module-level mocks
setupServerMocks();

const mockDb = createMockDbChain();
vi.mock("../../database/db.js", () => ({
  default: mockDb,
  getReadDb: () => mockDb,
  getWriteDb: () => mockDb,
}));

import { getTestApp } from "../helpers/testApp.js";

describe("Status Routes - GET /api/v1/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 for unauthenticated requests", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/status");

    expect(res.status).toBe(401);
  });
});

describe("Status Routes - GET /api/v1/status/health", () => {
  it("should return 401 for unauthenticated requests", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/status/health");

    expect(res.status).toBe(401);
  });
});

describe("Status Routes - GET /api/v1/status/debug", () => {
  it("should return 401 for unauthenticated requests", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/status/debug");

    expect(res.status).toBe(401);
  });
});

describe("System Routes - GET /api/v1/system/stats", () => {
  it("should require authentication", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/system/stats");

    expect(res.status).toBe(401);
  });
});

describe("CSRF Token Endpoint - GET /api/v1/csrf-token", () => {
  it("should return a CSRF token", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/csrf-token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("csrfToken");
    expect(typeof res.body.csrfToken).toBe("string");
    expect(res.body.csrfToken.length).toBeGreaterThan(0);
  });
});

describe("Metrics Endpoint - GET /metrics", () => {
  it("should return metrics without authentication", async () => {
    const request = await getTestApp();
    const res = await request.get("/metrics");

    expect(res.status).toBe(200);
  });
});

describe("Operation Mode Data - GET /api/v1/operation-mode-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.then.mockImplementation((resolve: any) =>
      Promise.resolve([]).then(resolve),
    );
  });

  it("should require authentication", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/operation-mode-data");

    expect(res.status).toBe(401);
  });
});

describe("Database Routes - GET /api/v1/db/test", () => {
  it("should require authentication", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/db/test");

    expect(res.status).toBe(401);
  });
});

describe("OPC-UA Routes - GET /api/v1/opcua/status", () => {
  it("should require authentication", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/opcua/status");

    expect(res.status).toBe(401);
  });
});

describe("Certificate Routes - GET /api/v1/certificates/trusted", () => {
  it("should require authentication", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/certificates/trusted");

    expect(res.status).toBe(401);
  });
});
