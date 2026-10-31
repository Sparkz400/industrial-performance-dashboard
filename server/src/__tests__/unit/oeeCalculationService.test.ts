import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../repositories/oeeRepository.js", () => ({
  oeeRepository: {
    getConfig: vi.fn(),
    getOperationModeData: vi.fn(),
    getNodeData: vi.fn(),
    getManualEntries: vi.fn(),
  },
}));
vi.mock("../../utils/logger.js", () => ({ default: { debug: vi.fn() } }));
import { oeeRepository } from "../../repositories/oeeRepository.js";
import { oeeCalculationService as service } from "../../services/oeeCalculationService.js";
const start = new Date("2026-01-01T08:00:00Z");
const end = new Date("2026-01-01T09:00:00Z");
const point = (minutes: number, value: number | null) => ({
  timestamp: new Date(+start + minutes * 60000),
  value,
  statusCode: "Good",
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(oeeRepository.getConfig).mockResolvedValue({
    runningModeValues: [1],
    idleModeValues: [0],
    plannedStopModeValues: [2],
    unplannedStopModeValues: [3],
    idealCycleTimeMs: 1000,
    productionCountNodeKey: "Count",
    goodCountNodeKey: "Good",
    rejectCountNodeKey: "Reject",
  } as any);
});
describe("OEE measurement boundaries", () => {
  it("expires a stale predecessor instead of claiming a complete hour", async () => {
    vi.mocked(oeeRepository.getOperationModeData).mockResolvedValue([
      point(-10, 1),
    ]);
    expect(await service.calculateAvailability(1, start, end)).toMatchObject({
      availability: 0,
      runningTimeMinutes: 0,
      totalTimeMinutes: 60,
      unknownTimeMinutes: 60,
    });
  });
  it("clips both boundaries and preserves bad-quality time as unknown", async () => {
    vi.mocked(oeeRepository.getOperationModeData).mockResolvedValue([
      point(-0.5, 1),
      point(0.25, null),
      point(30, 2),
      point(59.5, 1),
    ]);
    expect(await service.calculateAvailability(1, start, end)).toMatchObject({
      runningTimeMinutes: 0.75,
      plannedStopTimeMinutes: 1,
      totalTimeMinutes: 60,
      unknownTimeMinutes: 58.25,
    });
  });
  it("does not infer the state before the first sample", async () => {
    vi.mocked(oeeRepository.getOperationModeData).mockResolvedValue([
      point(15, 1),
    ]);
    expect(await service.calculateAvailability(1, start, end)).toMatchObject({
      runningTimeMinutes: 1,
      unknownTimeMinutes: 59,
    });
  });
  it("counts increases on both sides of a counter reset", async () => {
    vi.mocked(oeeRepository.getNodeData).mockResolvedValue([
      point(0, 100),
      point(1, 110),
      point(2, 3),
      point(3, 8),
    ]);
    expect(
      await service.calculatePerformance(1, start, point(3, 0).timestamp, 3),
    ).toMatchObject({ totalCount: 18, dataComplete: true });
  });
  it("does not turn missing readings into production", async () => {
    vi.mocked(oeeRepository.getNodeData).mockResolvedValue([
      point(0, 100),
      point(1, null),
      point(2, 120),
      point(3, 125),
    ]);
    expect(await service.calculatePerformance(1, start, end, 60)).toMatchObject(
      { totalCount: 5, dataComplete: false },
    );
  });
  it("does not report perfect quality with no measurements", async () => {
    vi.mocked(oeeRepository.getNodeData).mockResolvedValue([]);
    expect(await service.calculateQuality(1, start, end)).toMatchObject({
      quality: 0,
      dataComplete: false,
    });
  });
  it("rejects reversed or empty windows", async () => {
    await expect(
      service.calculateOeeHistory(1, end, start, "hour"),
    ).rejects.toThrow("endDate");
    await expect(
      service.calculateAvailability(1, start, start),
    ).rejects.toThrow("endDate");
  });
});

it("requires both counter boundaries and rejects deltas across gaps", async () => {
  for (const points of [
    [point(0, 0), point(1, 60)],
    [point(-1, 0), point(0.5, 60), point(60, 100)],
    [point(0, 0), point(60, 100)],
  ]) {
    vi.mocked(oeeRepository.getNodeData).mockResolvedValue(points);
    expect(
      (await service.calculatePerformance(1, start, end, 60)).dataComplete,
    ).toBe(false);
    expect((await service.calculateQuality(1, start, end)).dataComplete).toBe(
      false,
    );
  }
  expect(
    (await service.calculatePerformance(1, start, end, 60)).totalCount,
  ).toBe(0);
});
it("accepts fully covered counters and never bridges bad quality", async () => {
  const points = Array.from({ length: 61 }, (_, i) => point(i, i));
  vi.mocked(oeeRepository.getNodeData).mockResolvedValue(points);
  expect(await service.calculatePerformance(1, start, end, 60)).toMatchObject({
    totalCount: 60,
    dataComplete: true,
  });
  points[30].statusCode = "BadNoCommunication";
  expect(await service.calculatePerformance(1, start, end, 60)).toMatchObject({
    totalCount: 58,
    dataComplete: false,
  });
  vi.mocked(oeeRepository.getOperationModeData).mockResolvedValue([
    { ...point(0, 1), statusCode: "Bad" },
  ]);
  expect(
    (await service.calculateAvailability(1, start, end)).unknownTimeMinutes,
  ).toBe(60);
});
describe("daily manual quantities", () => {
  beforeEach(async () => {
    const config = await oeeRepository.getConfig(1);
    vi.mocked(oeeRepository.getConfig).mockResolvedValue({
      ...config,
      productionCountNodeKey: null,
      goodCountNodeKey: null,
      rejectCountNodeKey: null,
      manualEntryEnabled: true,
    } as any);
    vi.mocked(oeeRepository.getOperationModeData).mockResolvedValue([]);
    vi.mocked(oeeRepository.getManualEntries).mockResolvedValue([
      { productionCount: 100, goodCount: 90, rejectCount: 10 },
    ] as any);
  });
  it("does not repeat a daily quantity in hourly or partial-day buckets", async () => {
    const history = await service.calculateOeeHistory(
      1,
      start,
      new Date(+start + 2 * 3600000),
      "hour",
    );
    expect(history.map((row) => row.performance.totalCount)).toEqual([0, 0]);
    expect(
      history.every((row) => !row.dataComplete && !row.quality.dataComplete),
    ).toBe(true);
    expect(oeeRepository.getManualEntries).not.toHaveBeenCalled();
  });
  it("excludes midnight of the following day and labels declarations provisional", async () => {
    const day = new Date("2026-01-01T00:00:00Z"),
      next = new Date("2026-01-02T00:00:00Z");
    expect(await service.calculatePerformance(1, day, next, 60)).toMatchObject({
      totalCount: 100,
      dataComplete: false,
    });
    expect(await service.calculateQuality(1, day, next)).toMatchObject({
      goodCount: 90,
      rejectCount: 10,
      dataComplete: false,
    });
    expect(oeeRepository.getManualEntries).toHaveBeenLastCalledWith(
      1,
      "2026-01-01",
      "2026-01-01",
    );
  });
});
