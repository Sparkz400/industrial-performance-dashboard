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
  it("carries an unchanged state across the entire requested hour", async () => {
    vi.mocked(oeeRepository.getOperationModeData).mockResolvedValue([
      point(-10, 1),
    ]);
    expect(await service.calculateAvailability(1, start, end)).toMatchObject({
      availability: 1,
      runningTimeMinutes: 60,
      totalTimeMinutes: 60,
      unknownTimeMinutes: 0,
    });
  });
  it("clips both boundaries and preserves bad-quality time as unknown", async () => {
    vi.mocked(oeeRepository.getOperationModeData).mockResolvedValue([
      point(-10, 1),
      point(20, null),
      point(30, 2),
      point(45, 1),
    ]);
    expect(await service.calculateAvailability(1, start, end)).toMatchObject({
      runningTimeMinutes: 35,
      plannedStopTimeMinutes: 15,
      totalTimeMinutes: 60,
      unknownTimeMinutes: 10,
    });
  });
  it("does not infer the state before the first sample", async () => {
    vi.mocked(oeeRepository.getOperationModeData).mockResolvedValue([
      point(15, 1),
    ]);
    expect(await service.calculateAvailability(1, start, end)).toMatchObject({
      runningTimeMinutes: 45,
      unknownTimeMinutes: 15,
    });
  });
  it("counts increases on both sides of a counter reset", async () => {
    vi.mocked(oeeRepository.getNodeData).mockResolvedValue([
      point(0, 100),
      point(10, 110),
      point(20, 3),
      point(50, 8),
    ]);
    expect(await service.calculatePerformance(1, start, end, 60)).toMatchObject(
      { totalCount: 18, dataComplete: true },
    );
  });
  it("does not turn missing readings into production", async () => {
    vi.mocked(oeeRepository.getNodeData).mockResolvedValue([
      point(0, 100),
      point(10, null),
      point(20, 120),
      point(50, 125),
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
