import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDbChain } from "../helpers/mockDb.js";

const mockDb = createMockDbChain();
vi.mock("../../database/db.js", () => ({
  default: mockDb,
  getReadDb: () => mockDb,
  getWriteDb: () => mockDb,
}));

import { getTestApp, getAgentWithCsrf } from "../helpers/testApp.js";

describe("Machine Routes - GET /api/v1/machines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.returning.mockResolvedValue([]);
    mockDb.then.mockImplementation((resolve: any) =>
      Promise.resolve([]).then(resolve),
    );
  });

  it("should return 401 for unauthenticated GET requests", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/machines");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("Machine Routes - POST /api/v1/machines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.returning.mockResolvedValue([]);
  });

  it("should require authentication to create a machine", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/machines")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Test Machine",
        ip: "192.168.1.100",
        port: 4840,
        securityMode: "None",
      });

    expect(res.status).toBe(401);
  });

  it("should reject unauthenticated POST without session before CSRF validation", async () => {
    const request = await getTestApp();
    const res = await request.post("/api/v1/machines").send({
      name: "Test Machine",
      ip: "192.168.1.100",
      port: 4840,
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("INVALID_CSRF_TOKEN");
  });
});

describe("Machine Routes - GET /api/v1/machines/:id", () => {
  it("should require authentication", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/machines/1");
    expect(res.status).toBe(401);
  });
});

describe("Machine Routes - PUT /api/v1/machines/:id", () => {
  it("should require authentication", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .put("/api/v1/machines/1")
      .set("x-csrf-token", csrfToken)
      .send({ name: "Updated Machine", ip: "192.168.1.100", port: 4840 });
    expect(res.status).toBe(401);
  });
});

describe("Machine Routes - DELETE /api/v1/machines/:id", () => {
  it("should require authentication", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .delete("/api/v1/machines/1")
      .set("x-csrf-token", csrfToken);
    expect(res.status).toBe(401);
  });
});

describe("Machine Routes - POST /api/v1/machines/:id/connect", () => {
  it("should require authentication", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/machines/1/connect")
      .set("x-csrf-token", csrfToken);
    expect(res.status).toBe(401);
  });
});

describe("Machine Routes - POST /api/v1/machines/:id/disconnect", () => {
  it("should require authentication", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/machines/1/disconnect")
      .set("x-csrf-token", csrfToken);
    expect(res.status).toBe(401);
  });
});

describe("Machine Routes - POST /api/v1/machines/:id/browse-nodes", () => {
  it("should require authentication", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/machines/1/browse-nodes")
      .set("x-csrf-token", csrfToken)
      .send({ parentNodeId: "" });
    expect(res.status).toBe(401);
  });
});

describe("Machine Routes - Node Mappings", () => {
  it("GET /api/v1/machines/:id/mappings should require auth", async () => {
    const request = await getTestApp();
    const res = await request.get("/api/v1/machines/1/mappings");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/machines/:id/mappings should require auth", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .post("/api/v1/machines/1/mappings")
      .set("x-csrf-token", csrfToken)
      .send({
        mappings: [
          {
            nodeId: "ns=2;s=TestNode",
            nodeKey: "TestKey",
            displayName: "Test Node",
          },
        ],
      });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/v1/machines/:id/mappings/:mappingId should require auth", async () => {
    const { agent, csrfToken } = await getAgentWithCsrf();
    const res = await agent
      .delete("/api/v1/machines/1/mappings/5")
      .set("x-csrf-token", csrfToken);
    expect(res.status).toBe(401);
  });
});
