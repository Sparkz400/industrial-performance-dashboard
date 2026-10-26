import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  moving: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../../database/db.js", () => ({ default: {}, getReadDb: vi.fn() }));
vi.mock("../../repositories/spcRepository.js", () => ({
  spcRepository: {
    listActiveProfilesByNodeKey: mocks.profiles,
    updateProfile: mocks.update,
  },
}));
vi.mock("../../services/spcEvaluator.js", () => ({
  movingAverageCheck: mocks.moving,
  zScoreCheck: vi.fn(),
  cusumCheck: vi.fn(),
  westernElectricRules: vi.fn(),
}));
import { spcService } from "../../services/spcService.js";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.moving.mockImplementation((values) => ({
    isAnomaly: false,
    snapshot: [...values],
  }));
});

it("gives each machine and each profile exactly its own samples", async () => {
  const profiles = [
    { id: 301, machineId: 1, method: "moving_avg", windowSize: 3 },
    { id: 302, machineId: 1, method: "moving_avg", windowSize: 3 },
    { id: 303, machineId: 2, method: "moving_avg", windowSize: 3 },
  ];
  mocks.profiles.mockResolvedValue(profiles);
  await spcService.evaluateDataPoint("Temperature", 10, 1);
  await spcService.evaluateDataPoint("Temperature", 999, 2);
  await spcService.evaluateDataPoint("Temperature", 20, 1);
  expect(
    mocks.moving.mock.results.map((result) => result.value.snapshot),
  ).toEqual([[10], [10], [999], [10, 20], [10, 20]]);
  mocks.update.mockResolvedValue(profiles[0]);
  await spcService.updateProfile(301, { windowSize: 3 });
  await spcService.evaluateDataPoint("Temperature", 30, 1);
  expect(mocks.moving.mock.results.at(-2)?.value.snapshot).toEqual([30]);
  await spcService.evaluateDataPoint("Temperature", 1);
  await spcService.evaluateDataPoint("Temperature", NaN, 1);
  expect(mocks.moving).toHaveBeenCalledTimes(7);
});
