import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDbChain, setupServerMocks } from "../helpers/mockDb.js";

setupServerMocks();

const mockDb = createMockDbChain();
vi.mock("../../database/db.js", () => ({
  default: mockDb,
  getReadDb: () => mockDb,
  getWriteDb: () => mockDb,
}));

import { getTestApp, getAgentWithCsrf } from "../helpers/testApp.js";

describe("Dashboard Routes - GET /api/v1/dashboards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.returning.mockResolvedValue([]);
    mockDb.then.mockImplementation((resolve: any) =>
      Promise.resolve([]).then(resolve),
    );
  });

  it("should return 401 for unauthenticated requests", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/dashboards");

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("error");
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("Dashboard Routes - POST /api/v1/dashboards/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.returning.mockResolvedValue([]);
  });

  it("should reject unauthenticated import requests with 401", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/dashboards/import")
      .set("x-csrf-token", csrfToken)
      .send({ name: "Imported Dashboard", widgets: [], layout: [] });

    expect(res.status).toBe(401);
  });

  it("should reject unauthenticated POST requests", async () => {
    const request = await getTestApp();
    const res = await request
      .post("/api/v1/dashboards/import")
      .send({ name: "Imported Dashboard", widgets: [], layout: [] });

    expect(res.status).toBe(401);
  });
});

describe("Dashboard Routes - GET /api/v1/dashboards/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require authentication", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/dashboards/dash-test-123");

    expect(res.status).toBe(401);
  });
});

describe("Dashboard Routes - DELETE /api/v1/dashboards/:id", () => {
  it("should require authentication for delete", async () => {
    const request = await getTestApp();
    const res = await request.delete("/api/v1/dashboards/dash-test-123");

    expect(res.status).toBe(401);
  });

  it("should require authentication even with CSRF token", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .delete("/api/v1/dashboards/dash-test-123")
      .set("x-csrf-token", csrfToken);

    expect(res.status).toBe(401);
  });
});
