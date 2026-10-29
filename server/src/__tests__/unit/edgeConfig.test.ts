import { expect, it, vi } from "vitest";
vi.mock("../../database/db.js", () => ({ default: {} }));
const { checkEdgeConfig } = await import("../../services/edgeSyncService.js");

it("applies a supported revision and rejects incompatible ones instead of guessing", () => {
  expect(
    checkEdgeConfig({
      schemaVersion: 1,
      settings: { syncIntervalSeconds: 10, batchSize: 200 },
    }),
  ).toEqual({ value: { syncIntervalSeconds: 10, batchSize: 200 } });
  expect(checkEdgeConfig({ schemaVersion: 2, settings: {} })).toMatchObject({
    error: expect.stringContaining("schema 2 is not supported"),
  });
  for (const settings of [
    { syncIntervalSeconds: 1 },
    { batchSize: "500" },
    { machineCommand: "start" },
    null,
  ])
    expect(checkEdgeConfig({ schemaVersion: 1, settings })).toHaveProperty(
      "error",
    );
});
