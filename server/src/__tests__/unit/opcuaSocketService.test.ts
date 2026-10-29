import { expect, it, vi } from "vitest";
import { OpcuaSocketService } from "../../socket/services/OpcuaSocketService.js";
vi.mock("../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn() },
}));

it("broadcasts unchanged values when quality changes, independently per machine", () => {
  const emit = vi.fn();
  const to = vi.fn((_room: string) => ({ emit }));
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
  expect(emit).toHaveBeenCalledTimes(1);
  service.broadcastNodeChange({ ...sample, statusCode: "BadNoCommunication" });
  expect(emit).toHaveBeenCalledTimes(2);
  expect(emit.mock.lastCall?.[1].statusCode).toBe("BadNoCommunication");
  service.broadcastNodeChange({ ...sample, machineId: 2 });
  expect(emit).toHaveBeenCalledTimes(3);
  // Machine data never reaches the key-only room, whose name could collide with "opcua-<id>-<key>".
  expect(to.mock.calls.map(([room]) => room)).toEqual([
    "opcua-1-Count",
    "opcua-1-Count",
    "opcua-2-Count",
  ]);
});

it("keeps legacy unscoped data in key-only rooms", () => {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  new OpcuaSocketService({ to } as never).broadcastNodeChange({
    key: "Count",
    label: "Count",
    value: 1,
    timestamp: new Date(),
    dataType: "UInt32",
    statusCode: "Good",
  });
  expect(to).toHaveBeenCalledWith("opcua-Count");
});
