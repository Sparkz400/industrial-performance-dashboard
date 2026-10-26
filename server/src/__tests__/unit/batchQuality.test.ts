import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
  recipe: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../database/db.js", () => ({
  default: { execute: mocks.execute },
  getReadDb: () => ({ execute: mocks.execute }),
}));
vi.mock("../../repositories/batchRepository.js", () => ({
  batchRepository: {
    findById: mocks.find,
    update: mocks.update,
    create: mocks.create,
  },
}));
vi.mock("../../repositories/recipeRepository.js", () => ({
  recipeRepository: { findById: mocks.recipe },
}));
vi.mock("../../services/auditLogService.js", () => ({
  auditLogService: { recordEvent: vi.fn() },
}));
import { batchService } from "../../services/batchService.js";
const parameter = {
  nodeKey: "pressure",
  displayName: "Pressure",
  targetValue: 0,
  tolerance: 1,
};
const batch = {
  id: 1,
  machineId: 1,
  recipeId: 1,
  recipeSnapshot: {
    id: 1,
    name: "Original",
    version: 1,
    parameters: [parameter],
    setpoints: {},
  },
  startedAt: new Date("2026-01-01"),
  completedAt: new Date("2026-01-02"),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue(batch);
  mocks.execute.mockResolvedValue({ rows: [] });
});
it("does not turn missing measurements into compliant zeroes", async () => {
  const summary = await batchService.computeBatchSummary(1);
  expect(summary.overallCompliance).toBeNull();
  expect(summary.parameterResults[0]).toMatchObject({
    actualAvg: null,
    actualMin: null,
    actualMax: null,
    withinTolerance: null,
    sampleCount: 0,
  });
});
it("reports empty recipes as unknown", async () => {
  mocks.find.mockResolvedValue({
    ...batch,
    recipeSnapshot: { ...batch.recipeSnapshot, parameters: [] },
  });
  expect(
    (await batchService.computeBatchSummary(1)).overallCompliance,
  ).toBeNull();
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("retains real zeroes and filters quality and adjacent batch boundaries in SQL", async () => {
  mocks.execute.mockResolvedValue({
    rows: [
      {
        node_key: "pressure",
        avg_value: "0",
        min_value: "0",
        max_value: "0",
        sample_count: "2",
        total_count: "3",
      },
    ],
  });
  const summary = await batchService.computeBatchSummary(1);
  expect(summary.parameterResults[0]).toMatchObject({
    actualAvg: 0,
    withinTolerance: true,
    sampleCount: 2,
    excludedCount: 1,
  });
  expect(summary.overallCompliance).toBeNull();
  const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
  expect(query.sql).toContain("status_code LIKE 'Good%'");
  expect(query.sql).toMatch(/timestamp >= .* AND timestamp </);
  expect(query.sql).toContain("'NaN'::real");
  expect(mocks.recipe).not.toHaveBeenCalled();
});
it("recognizes genuine zeroes when all recorded readings are usable", async () => {
  mocks.execute.mockResolvedValue({
    rows: [
      {
        node_key: "pressure",
        avg_value: "0",
        min_value: "0",
        max_value: "0",
        sample_count: "2",
        total_count: "2",
      },
    ],
  });
  expect((await batchService.computeBatchSummary(1)).overallCompliance).toBe(
    100,
  );
});
it("preserves raw bad readings as chart gaps and in comparison", async () => {
  mocks.execute.mockResolvedValue({
    rows: [
      {
        node_key: "pressure",
        timestamp: batch.startedAt.toISOString(),
        value: "123",
        raw_value: 123,
        status_code: "Bad",
      },
    ],
  });
  const [series] = await batchService.getBatchData(1);
  expect(series).toMatchObject({ targetValue: 0, tolerance: 1 });
  expect(series.dataPoints[0]).toMatchObject({
    value: null,
    rawValue: 123,
    statusCode: "Bad",
  });
  const [comparison] = await batchService.compareBatches([1]);
  expect(comparison.data[0].dataPoints[0]).toMatchObject({
    timestamp: "0",
    value: null,
    rawValue: 123,
    statusCode: "Bad",
  });
});
it("does not silently use a changed recipe for legacy batches", async () => {
  mocks.find.mockResolvedValue({ ...batch, recipeSnapshot: null });
  await expect(batchService.computeBatchSummary(1)).rejects.toThrow(
    "no frozen recipe",
  );
});
