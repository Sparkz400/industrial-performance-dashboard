import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const chain: Record<string, unknown> = {};
  for (const step of [
    "select",
    "selectDistinct",
    "from",
    "where",
    "orderBy",
    "limit",
  ])
    chain[step] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve([{ n: 0 }]);
  return {
    db: chain,
    holds: vi.fn(),
    getHealth: vi.fn(),
    observeHealth: vi.fn(),
  };
});
vi.mock("../../database/db.js", () => ({ default: mocks.db }));
vi.mock("../../services/collectorLock.js", () => ({
  collectorLockHeldElsewhere: async () => mocks.holds(),
}));
vi.mock("../../queue/opcuaQueueWorker.js", () => ({
  default: { getHealth: mocks.getHealth },
}));
vi.mock("../../services/alarmService.js", () => ({
  default: { observeHealth: mocks.observeHealth },
}));
vi.mock("../../services/liveProductionService.js", () => ({
  liveProduction: vi.fn(),
}));
vi.mock("../../services/maintenanceActions.js", () => ({
  escalateMaintenanceActions: vi.fn(),
}));
vi.mock("../../services/storageRunway.js", () => ({
  storageRunway: async () => [],
}));
vi.mock("../../services/historyRetention.js", () => ({
  runRetentionSchedules: vi.fn(),
}));
vi.mock("../../services/reportJobService.js", () => ({
  reportJobService: { pruneFiles: vi.fn() },
}));
import { healthIncidentService } from "../../services/healthIncidentService.js";

beforeEach(() => vi.clearAllMocks());

it("leaves collector incidents to a collector running in another instance", async () => {
  mocks.holds.mockReturnValue(true);
  await healthIncidentService.check();
  expect(mocks.getHealth).not.toHaveBeenCalled();
  const keys = mocks.observeHealth.mock.calls.map((call) => call[0]);
  expect(keys.filter((key: string) => key.startsWith("collector-"))).toEqual(
    [],
  );
});

it("reports collector incidents when no other instance collects", async () => {
  mocks.holds.mockReturnValue(false);
  mocks.getHealth.mockResolvedValue({
    storageFailure: null,
    pendingMeasurements: 0,
    capacityMeasurements: 100,
    oldestReceivedAgeSeconds: null,
    unknownReceiveTimes: 0,
    committedLastMinute: 0,
    quarantinedMeasurements: 0,
    freeStorageBytes: null,
    storageReserveBytes: 1,
  });
  await healthIncidentService.check();
  expect(mocks.observeHealth.mock.calls.map((call) => call[0])).toContain(
    "collector-backlog",
  );
});
