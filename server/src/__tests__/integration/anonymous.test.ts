import { describe, expect, it, vi } from "vitest";
import { createMockDbChain } from "../helpers/mockDb.js";
import { concretePath, routeInventory } from "../helpers/routeInventory.js";

const mockDb = createMockDbChain();
vi.mock("../../database/db.js", () => ({
  default: mockDb,
  getReadDb: () => mockDb,
  getWriteDb: () => mockDb,
}));

import { getTestApp } from "../helpers/testApp.js";

// Only sign-in and selected-data links are reachable without a session.
const PUBLIC = /^\/(auth|share)(\/|$)/;

describe("anonymous requests", () => {
  const { routes } = routeInventory();

  it("are rejected on every mounted /api/v1 route", async () => {
    const request = await getTestApp();
    const reached: string[] = [];
    for (const { method, path } of routes.filter((r) => !PUBLIC.test(r.path))) {
      const url = "/api/v1" + concretePath(path);
      const res = await (
        request as unknown as Record<
          string,
          (url: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](url);
      // Reads need a session (401); writes are refused earlier by CSRF (403) or by auth.
      if (![401, 403].includes(res.status))
        reached.push(`${method} ${path} -> ${res.status}`);
    }
    expect(reached).toEqual([]);
  }, 60_000);

  it("cannot reach tRPC procedures", async () => {
    const request = await getTestApp();
    for (const path of ["dashboard.list", "alarm.list", "status.current"])
      expect((await request.get(`/api/trpc/${path}`)).status).toBe(401);
  });

  it("cannot send request bodies above the JSON limit", async () => {
    const request = await getTestApp();
    const res = await request
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ username: "x", password: "y".repeat(200_000) }));
    expect(res.status).toBe(413);
  });

  it("cannot read metrics", async () => {
    const request = await getTestApp();
    expect((await request.get("/metrics")).status).toBe(401);
  });
});
