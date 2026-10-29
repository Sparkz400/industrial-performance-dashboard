import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  moving: vi.fn(),
  update: vi.fn(),
  recent: vi.fn(),
}));
vi.mock("../../database/db.js", () => ({ default: {}, getReadDb: vi.fn() }));
vi.mock("../../repositories/spcRepository.js", () => ({
  spcRepository: {
    listActiveProfilesByNodeKey: mocks.profiles,
    updateProfile: mocks.update,
    recentGoodRun: mocks.recent,
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
  mocks.recent.mockResolvedValue([]);
  mocks.moving.mockImplementation((values) => ({
    isAnomaly: false,
    snapshot: [...values],
  }));
});
const snapshots = () =>
  mocks.moving.mock.results.map((result) => result.value.snapshot);

it("keeps each machine and profile's window, judges only full windows and restarts runs", async () => {
  const profiles = [
    { id: 301, machineId: 1, method: "moving_avg", windowSize: 3 },
    { id: 302, machineId: 1, method: "moving_avg", windowSize: 3 },
    { id: 303, machineId: 2, method: "moving_avg", windowSize: 3 },
  ];
  mocks.profiles.mockResolvedValue(profiles);
  let t = 0;
  const at = () => ++t * 1000;
  for (const [value, machine] of [
    [10, 1],
    [999, 2],
    [20, 1],
  ])
    await spcService.evaluateDataPoint("Temperature", value, machine, at());
  expect(mocks.moving).not.toHaveBeenCalled();
  await spcService.evaluateDataPoint("Temperature", 30, 1, at());
  expect(snapshots()).toEqual([
    [10, 20, 30],
    [10, 20, 30],
  ]);

  // A duplicate or older timestamp (the value re-sent on reconnect) is not counted twice.
  await spcService.evaluateDataPoint("Temperature", 30, 1, t * 1000);
  await spcService.evaluateDataPoint("Temperature", 5, 1, 500);
  expect(mocks.moving).toHaveBeenCalledTimes(2);

  // A bad sample ends the run; three new good samples are needed again.
  await spcService.evaluateDataPoint(
    "Temperature",
    null,
    1,
    at(),
    "BadSensorFailure",
  );
  await spcService.evaluateDataPoint("Temperature", 40, 1, at());
  await spcService.evaluateDataPoint("Temperature", 41, 1, at());
  expect(mocks.moving).toHaveBeenCalledTimes(2);
  await spcService.evaluateDataPoint("Temperature", 42, 1, at());
  expect(snapshots().at(-1)).toEqual([40, 41, 42]);

  // After a restart (here: a profile edit clears its window) the stored run is reloaded.
  mocks.update.mockResolvedValue(profiles[0]);
  await spcService.updateProfile(301, { windowSize: 3 });
  mocks.recent.mockResolvedValueOnce([
    { value: 41, at: new Date(t * 1000 - 1000) },
    { value: 42, at: new Date(t * 1000) },
  ]);
  await spcService.evaluateDataPoint("Temperature", 43, 1, at());
  expect(mocks.recent).toHaveBeenCalledWith(
    1,
    "Temperature",
    new Date(t * 1000),
    8,
  );
  // Profile 302 was not edited and keeps its run (the evaluator slices its own window).
  expect(snapshots().slice(-2)).toEqual([
    [41, 42, 43],
    [40, 41, 42, 43],
  ]);
  // Legacy unscoped samples and non-finite values never reach an evaluator.
  await spcService.evaluateDataPoint("Temperature", 1);
  await spcService.evaluateDataPoint("Temperature", NaN, 1, at());
  expect(mocks.moving).toHaveBeenCalledTimes(6);
});

it("evaluates samples of one signal in arrival order even when not awaited", async () => {
  mocks.profiles.mockResolvedValue([
    { id: 401, machineId: 3, method: "moving_avg", windowSize: 3 },
  ]);
  let release!: () => void;
  mocks.recent.mockReturnValueOnce(
    new Promise((resolve) => (release = () => resolve([]))),
  );
  const pending = [1, 2, 3].map((value) =>
    spcService.evaluateDataPoint("Flow", value, 3, value * 1000),
  );
  release();
  await Promise.all(pending);
  expect(snapshots()).toEqual([[1, 2, 3]]);
});
