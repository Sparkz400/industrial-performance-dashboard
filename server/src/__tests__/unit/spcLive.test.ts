import { beforeEach, expect, it, vi } from "vitest";
import {
  cusumCheck,
  westernElectricRules,
} from "../../services/spcEvaluator.js";

// Real evaluators; only storage is replaced. Datasets are constructed so the expected
// signal point follows from arithmetic shown in each case.
const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  history: [] as { value: number; at: Date }[],
  alerts: [] as { value: number; alertType: string }[],
}));
vi.mock("../../database/db.js", () => ({ default: {}, getReadDb: vi.fn() }));
vi.mock("../../repositories/spcRepository.js", () => ({
  spcRepository: {
    listActiveProfilesByNodeKey: mocks.profiles,
    updateProfile: vi.fn(async (id: number) => ({ id })),
    recentGoodRun: vi.fn(
      async (_m: number, _k: string, before: Date, limit: number) =>
        mocks.history.filter((row) => row.at < before).slice(-limit),
    ),
    findRecentUnacknowledgedAlert: vi.fn(async () => null),
    createAlert: vi.fn(async (alert: { value: number; alertType: string }) => {
      mocks.alerts.push(alert);
      return { id: mocks.alerts.length, ...alert, createdAt: new Date() };
    }),
  },
}));
import { clearProfileBuffers, spcService } from "../../services/spcService.js";

beforeEach(() => {
  mocks.history.length = 0;
  mocks.alerts.length = 0;
});

it("CUSUM signals a +1.5σ shift at h = 5σ, not at the former 2.5σ", () => {
  // k = 0.5: each shifted sample adds 1.5 - 0.5 = 1.0 to C+; C+ > 5 first after 6 samples.
  const shifted = (n: number) => [
    ...Array(20).fill(10),
    ...Array(n).fill(11.5),
  ];
  expect(cusumCheck(shifted(5), 10, 0.5).isAnomaly).toBe(false);
  expect(cusumCheck(shifted(6), 10, 0.5)).toMatchObject({
    isAnomaly: true,
    alertType: "ucl_breach",
    cusumHigh: 6,
  });
  // In control at the target: never signals, however long the run.
  expect(cusumCheck(Array(500).fill(10), 10, 0.5).isAnomaly).toBe(false);
});

it("Western Electric rules: 2 of 3 beyond 2σ signals; a single point inside 3σ does not", () => {
  expect(westernElectricRules([0, 0, 0, 0, 0, 0, 0, 2.9], 0, 1).isAnomaly).toBe(
    false,
  );
  expect(
    westernElectricRules([0, 0, 0, 0, 0, 2.5, 0, 2.5], 0, 1).isAnomaly,
  ).toBe(true);
  // Zero variation is not a baseline.
  expect(westernElectricRules([0, 0, 0, 0, 0, 0, 0, 9], 0, 0).isAnomaly).toBe(
    false,
  );
});

const run = async (values: number[], restartAfter?: number) => {
  for (const [index, value] of values.entries()) {
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
    if (index === restartAfter) clearProfileBuffers(501);
    await spcService.evaluateDataPoint("Pressure", value, 7, at);
    mocks.history.push({ value, at }); // persisted after evaluation, as the spool does
  }
  return mocks.alerts.map((alert) => alert.alertType);
};

it("live CUSUM gives the same verdicts with or without a restart mid-run", async () => {
  mocks.profiles.mockResolvedValue([
    {
      id: 501,
      machineId: 7,
      name: "P",
      method: "cusum",
      windowSize: 30,
      mean: 10,
      stddev: 1,
      sensitivity: 3,
    },
  ]);
  const values = [...Array(30).fill(10), ...Array(8).fill(11.5)];
  const uninterrupted = await run(values);
  expect(uninterrupted.length).toBeGreaterThan(0);
  mocks.history.length = 0;
  mocks.alerts.length = 0;
  clearProfileBuffers(501);
  expect(await run(values, 33)).toEqual(uninterrupted);
});

it("does not judge without a full window or a positive baseline", async () => {
  mocks.profiles.mockResolvedValue([
    {
      id: 502,
      machineId: 8,
      name: "No baseline",
      method: "cusum",
      windowSize: 5,
      mean: null,
      stddev: null,
    },
    {
      id: 503,
      machineId: 8,
      name: "Zero variation",
      method: "zscore",
      windowSize: 5,
      mean: 10,
      stddev: 0,
      sensitivity: 3,
    },
    {
      id: 504,
      machineId: 8,
      name: "Moving",
      method: "moving_avg",
      windowSize: 50,
      sensitivity: 3,
    },
  ]);
  for (let i = 0; i < 20; i++)
    await spcService.evaluateDataPoint(
      "Level",
      i === 19 ? 1000 : 10,
      8,
      i * 1000,
    );
  // CUSUM has no target, z-score has no variation, and the moving window is not yet full.
  expect(mocks.alerts).toEqual([]);
});
