import { expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const mocks = vi.hoisted(() => ({ authenticateEdge: vi.fn() }));
vi.mock("../../services/edgeCentral.js", () => ({
  authenticateEdge: mocks.authenticateEdge,
  batchSchema: { validate: (v: unknown) => ({ value: v }) },
  enroll: vi.fn(),
  ingestBatch: vi.fn(async () => ({ accepted: 0 })),
}));
vi.mock("../../services/auditLogService.js", () => ({
  auditLogService: { recordEvent: vi.fn() },
}));
import edgeSyncRoutes from "../../routes/edgeSyncRoutes.js";
import { errorHandler } from "../../middleware/errorHandler.js";

const app = express();
app.use("/edge-sync", edgeSyncRoutes);
app.use(errorHandler(new Error("csrf")));

it("rejects an unknown edge before parsing its body", async () => {
  mocks.authenticateEdge.mockResolvedValue(null);
  // Malformed JSON would be a 400 if it were parsed before the token check.
  const res = await request(app)
    .post("/edge-sync/batches")
    .set("Content-Type", "application/json")
    .send("{not json");
  expect(res.status).toBe(401);
});

it("parses the batch for a known edge", async () => {
  mocks.authenticateEdge.mockResolvedValue({ id: 1 });
  const res = await request(app)
    .post("/edge-sync/batches")
    .set("Authorization", "Bearer x")
    .send({ cursor: 1 });
  expect(res.status).toBe(200);
});

it("caps enrollment bodies", async () => {
  const res = await request(app)
    .post("/edge-sync/enroll")
    .send({ code: "x".repeat(20_000) });
  expect(res.status).toBe(413);
});
