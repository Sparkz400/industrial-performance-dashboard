import { expect, it, vi } from "vitest";
import { OpcuaSocketService } from "../../socket/services/OpcuaSocketService.js";
vi.mock("../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn() },
}));

it("broadcasts unchanged values when quality changes, independently per machine", () => {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  const service = new OpcuaSocketService({ to } as never);
  const sample = {
    key: "Count",
    label: "Count",
    value: 10,
    timestamp: new Date(),
    dataType: "UInt32",
    statusCode: "Good",
    machineId: 1,
  };
  service.broadcastNodeChange(sample);
  service.broadcastNodeChange(sample);
  expect(emit).toHaveBeenCalledTimes(2);
  service.broadcastNodeChange({ ...sample, statusCode: "BadNoCommunication" });
  expect(emit).toHaveBeenCalledTimes(4);
  expect(emit.mock.lastCall?.[1].statusCode).toBe("BadNoCommunication");
  service.broadcastNodeChange({ ...sample, machineId: 2 });
  expect(emit).toHaveBeenCalledTimes(6);
});
