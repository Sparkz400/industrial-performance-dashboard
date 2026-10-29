import { expect, it, vi } from "vitest";

vi.mock("../../database/db.js", () => ({ default: {} }));
vi.mock("../../queue/opcuaQueueWorker.js", () => ({
  default: { enqueue: vi.fn() },
}));
const { parseMessage, jsonPointer } =
  await import("../../services/mqttIngestion.js");

const source = { id: 4, machineId: 7, brokerUrl: "mqtts://broker.test:8883" };
const map = (
  topic: string,
  nodeKey: string,
  valuePointer: string,
  dataType = "Double",
) => ({
  topic,
  nodeKey,
  valuePointer,
  timestampPointer: "/ts",
  dataType: dataType as "Double",
});
const message = (body: unknown) => Buffer.from(JSON.stringify(body));
const at = new Date("2026-05-01T00:00:00Z");

it("maps values by JSON pointer with a source timestamp and a stable identity", () => {
  const mappings = [
    map("line/press", "Pressure", "/p"),
    map("line/press", "Count", "/c/total", "UInt32"),
  ];
  const first = parseMessage(
    source,
    mappings,
    "line/press",
    message({ ts: "2026-05-01T06:00:00Z", p: 4.5, c: { total: 12 } }),
    at,
  );
  expect(first.rejected).toBeNull();
  expect(
    first.measurements.map((m) => [
      m.key,
      m.value,
      m.statusCode,
      m.timestamp.toISOString(),
    ]),
  ).toEqual([
    ["Pressure", 4.5, "Good", "2026-05-01T06:00:00.000Z"],
    ["Count", 12, "Good", "2026-05-01T06:00:00.000Z"],
  ]);
  const again = parseMessage(
    source,
    mappings,
    "line/press",
    message({ ts: "2026-05-01T06:00:00Z", p: 4.5, c: { total: 12 } }),
    at,
  );
  expect(again.measurements.map((m) => m.eventId)).toEqual(
    first.measurements.map((m) => m.eventId),
  );
  expect(first.measurements[0].eventId).toMatch(/^mqtt-[0-9a-f]{64}$/);
  expect(first.measurements[0].alreadySpooled).toBe(true);
  const epoch = parseMessage(
    source,
    mappings.slice(0, 1),
    "line/press",
    message({ ts: Date.parse("2026-05-01T06:00:01Z"), p: 4.6 }),
    at,
  );
  expect(epoch.measurements[0].timestamp.toISOString()).toBe(
    "2026-05-01T06:00:01.000Z",
  );
});

it("refuses messages it cannot place in time and marks unusable values bad", () => {
  const mappings = [
    map("t", "Pressure", "/p"),
    map("t", "Small", "/s", "Int16"),
  ];
  expect(
    parseMessage(source, mappings, "t", Buffer.from("{not json"), at),
  ).toEqual({ measurements: [], rejected: "Payload is not JSON" });
  expect(
    parseMessage(source, mappings, "other", message({}), at).rejected,
  ).toBe("Unmapped topic");
  expect(
    parseMessage(source, mappings, "t", Buffer.alloc(16385, 32), at).rejected,
  ).toBe("Payload exceeds 16 KiB");
  const untimed = parseMessage(
    source,
    mappings,
    "t",
    message({ ts: "yesterday", p: 1 }),
    at,
  );
  expect(untimed.measurements).toEqual([]);
  expect(untimed.rejected).toBe("No source timestamp at /ts for Small");
  const wrong = parseMessage(
    source,
    mappings,
    "t",
    message({ ts: "2026-05-01T06:00:00+02:00", p: "4.5", s: 40000 }),
    at,
  );
  expect(wrong.measurements.map((m) => [m.key, m.value, m.statusCode])).toEqual(
    [
      ["Pressure", null, "BadDecodingError"],
      ["Small", null, "BadDecodingError"],
    ],
  );
});

it("reads RFC 6901 pointers including escaped keys", () => {
  expect(jsonPointer({ "a/b": { "m~n": 3 } }, "/a~1b/m~0n")).toBe(3);
  expect(jsonPointer({ a: 1 }, "/missing")).toBeUndefined();
  expect(jsonPointer([5, 6], "/1")).toBe(6);
});
