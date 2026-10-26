import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  destroy: vi.fn(),
  generate: vi.fn(),
  list: vi.fn(),
}));
vi.mock("node-cron", async (original) => {
  const actual = await original<typeof import("node-cron")>();
  return {
    default: { validate: actual.default.validate, schedule: mocks.schedule },
  };
});
vi.mock("../../repositories/reportRepository.js", () => ({
  reportRepository: { getAllActiveSchedules: mocks.list },
}));
vi.mock("../../services/reportGeneratorService.js", () => ({
  reportGeneratorService: { generate: mocks.generate },
}));
import { reportSchedulerService } from "../../services/reportSchedulerService.js";
afterEach(() => {
  reportSchedulerService.stop();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("loads schedule timezones, executes the generator, and destroys replaced tasks", async () => {
  mocks.schedule.mockReturnValue({ destroy: mocks.destroy });
  mocks.list.mockResolvedValue([
    { id: 4, cronExpression: "0 6 * * *", timezone: "Europe/Berlin" },
  ]);
  await reportSchedulerService.init();
  expect(mocks.schedule).toHaveBeenCalledWith(
    "0 6 * * *",
    expect.any(Function),
    { timezone: "Europe/Berlin", noOverlap: true },
  );
  await mocks.schedule.mock.calls[0][1]();
  expect(mocks.generate).toHaveBeenCalledWith(4);
  await reportSchedulerService.refreshAll();
  expect(mocks.destroy).toHaveBeenCalledTimes(1);
  expect(reportSchedulerService.activeJobCount).toBe(1);
});

it("calculates the next run in the chosen timezone across DST and rejects invalid zones", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T05:00:00Z"));
  expect(
    reportSchedulerService.calculateNextRun("0 6 * * *", "Europe/Berlin"),
  ).toBe("2026-10-25T05:00:00.000Z");
  expect(reportSchedulerService.calculateNextRun("0 6 * * *", "UTC")).toBe(
    "2026-10-24T06:00:00.000Z",
  );
  expect(reportSchedulerService.calculateNextRun("invalid", "UTC")).toBeNull();
  expect(
    reportSchedulerService.calculateNextRun("0 6 * * *", "Invalid/Zone"),
  ).toBeNull();
});
