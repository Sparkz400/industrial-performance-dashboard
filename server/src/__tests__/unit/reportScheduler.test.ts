import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  due: vi.fn().mockResolvedValue(1),
  process: vi.fn().mockResolvedValue(undefined),
  legacy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/reportJobService.js", async (original) => {
  const actual =
    await original<typeof import("../../services/reportJobService.js")>();
  return {
    ...actual,
    reportJobService: {
      enqueueDue: mocks.due,
      processPending: mocks.process,
      markLegacyInterrupted: mocks.legacy,
    },
  };
});
import { reportSchedulerService } from "../../services/reportSchedulerService.js";
import { nextReportRun, reportRetry } from "../../services/reportJobService.js";
afterEach(() => {
  reportSchedulerService.stop();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("recovers pending jobs on startup and continues polling without overlapping ticks", async () => {
  await reportSchedulerService.init();
  await vi.waitFor(() => expect(mocks.process).toHaveBeenCalled());
  expect(mocks.legacy).toHaveBeenCalledOnce();
  expect(reportSchedulerService.activeJobCount).toBe(1);
  let finish!: () => void;
  mocks.process.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const tick = reportSchedulerService.tick();
  await vi.waitFor(() => expect(finish).toBeDefined());
  await reportSchedulerService.tick();
  finish();
  await tick;
  expect(mocks.process).toHaveBeenCalledTimes(2);
});
it("calculates timezone-aware persisted slots across DST and bounds retry attempts", () => {
  const before = new Date("2026-10-24T05:00:00Z");
  expect(
    nextReportRun("0 6 * * *", "Europe/Berlin", before)?.toISOString(),
  ).toBe("2026-10-25T05:00:00.000Z");
  expect(nextReportRun("0 6 * * *", "UTC", before)?.toISOString()).toBe(
    "2026-10-24T06:00:00.000Z",
  );
  expect(nextReportRun("invalid", "UTC", before)).toBeNull();
  expect(nextReportRun("0 6 * * *", "Invalid/Zone", before)).toBeNull();
  expect(reportRetry(1, before)?.getTime()).toBe(before.getTime() + 30000);
  expect(reportRetry(4, before)?.getTime()).toBe(before.getTime() + 240000);
  expect(reportRetry(5, before)).toBeNull();
});
