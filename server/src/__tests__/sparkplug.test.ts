import { describe, expect, it } from "vitest";
import {
  createSparkplugState,
  decodeSparkplugPayload,
  metricValue,
  parseSparkplugMessage,
  sparkplugStatus,
  sparkplugTopics,
  type SparkplugMapping,
} from "../services/sparkplug.js";

// Minimal Protocol Buffers encoder for hand-built Sparkplug B fixtures.
const varint = (value: number | bigint) => {
  let n = BigInt.asUintN(64, BigInt(value));
  const out: number[] = [];
  do {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    if (n) byte |= 0x80;
    out.push(byte);
  } while (n);
  return Buffer.from(out);
};
const field = (no: number, wire: number, body: Buffer) =>
  Buffer.concat([varint((no << 3) | wire), body]);
const num = (no: number, value: number | bigint | boolean) =>
  field(no, 0, varint(typeof value === "boolean" ? Number(value) : value));
const bytes = (no: number, body: Buffer | string) => {
  const b = Buffer.from(body);
  return field(no, 2, Buffer.concat([varint(b.length), b]));
};
interface M {
  name?: string;
  alias?: number;
  timestamp?: number;
  datatype?: number;
  isNull?: boolean;
  int?: number;
  long?: bigint;
  float?: number;
  double?: number;
  bool?: boolean;
  string?: string;
}
const metric = (m: M) => {
  const parts: Buffer[] = [];
  if (m.name !== undefined) parts.push(bytes(1, m.name));
  if (m.alias !== undefined) parts.push(num(2, m.alias));
  if (m.timestamp !== undefined) parts.push(num(3, m.timestamp));
  if (m.datatype !== undefined) parts.push(num(4, m.datatype));
  if (m.isNull) parts.push(num(7, true));
  if (m.int !== undefined) parts.push(num(10, m.int));
  if (m.long !== undefined) parts.push(num(11, m.long));
  if (m.float !== undefined) {
    const b = Buffer.alloc(4);
    b.writeFloatLE(m.float);
    parts.push(field(12, 5, b));
  }
  if (m.double !== undefined) {
    const b = Buffer.alloc(8);
    b.writeDoubleLE(m.double);
    parts.push(field(13, 1, b));
  }
  if (m.bool !== undefined) parts.push(num(14, m.bool));
  if (m.string !== undefined) parts.push(bytes(15, m.string));
  return Buffer.concat(parts);
};
const payload = (p: { timestamp?: number; seq?: number; metrics: M[] }) =>
  Buffer.concat([
    ...(p.timestamp === undefined ? [] : [num(1, p.timestamp)]),
    ...p.metrics.map((m) => bytes(2, metric(m))),
    ...(p.seq === undefined ? [] : [num(3, p.seq)]),
  ]);

const T = Date.UTC(2026, 9, 31, 6, 0);
const source = { id: 7, machineId: 3, brokerUrl: "mqtts://broker:8883" };
const mappings: SparkplugMapping[] = [
  {
    groupId: "Plant",
    edgeNodeId: "Line1",
    deviceId: null,
    metric: "Count",
    nodeKey: "Count",
    dataType: "UInt32",
  },
  {
    groupId: "Plant",
    edgeNodeId: "Line1",
    deviceId: null,
    metric: "Speed",
    nodeKey: "Speed",
    dataType: "Double",
  },
  {
    groupId: "Plant",
    edgeNodeId: "Line1",
    deviceId: "Press",
    metric: "Pressure",
    nodeKey: "Pressure",
    dataType: "Float",
  },
  {
    groupId: "Plant",
    edgeNodeId: "Line1",
    deviceId: "Press",
    metric: "Temp",
    nodeKey: "Temp",
    dataType: "Int16",
  },
];
const listener = () => {
  const state = createSparkplugState(mappings);
  const message = (
    type: string,
    p: Parameters<typeof payload>[0],
    device?: string,
  ) => {
    const result = parseSparkplugMessage(
      source,
      mappings,
      state,
      `spBv1.0/Plant/${type}/Line1${device ? `/${device}` : ""}`,
      payload(p),
      new Date(T + 60000),
    );
    return {
      ...result,
      rows: result.measurements.map((m) => [m.key, m.value, m.statusCode]),
    };
  };
  return { state, message, status: () => sparkplugStatus(state, mappings) };
};
const nbirth = (seq = 0, bdSeq = 1n, countAlias = 1, speedAlias = 2) => ({
  timestamp: T,
  seq,
  metrics: [
    { name: "bdSeq", datatype: 8, long: bdSeq },
    { name: "Count", alias: countAlias, datatype: 7, int: 10 },
    { name: "Speed", alias: speedAlias, datatype: 10, double: 1.5 },
  ],
});

describe("Sparkplug B payload decoding", () => {
  it("matches a literal protobuf fixture", () => {
    const literal = Buffer.from("0801120b0a0161200350ffffffff0f1800", "hex");
    expect(
      payload({
        timestamp: 1,
        seq: 0,
        metrics: [{ name: "a", datatype: 3, int: 0xffffffff }],
      }),
    ).toEqual(literal);
    const decoded = decodeSparkplugPayload(literal);
    expect(decoded).toMatchObject({ timestamp: 1, seq: 0 });
    expect(decoded.metrics[0]).toMatchObject({ name: "a", datatype: 3 });
    expect(metricValue(decoded.metrics[0].value!, 3)).toBe(-1);
  });

  it("reads negative Int8 and Int16 in the 3.0 and the older narrow form", () => {
    expect(metricValue({ kind: "int", raw: -5 >>> 0 }, 1)).toBe(-5);
    expect(metricValue({ kind: "int", raw: 251 }, 1)).toBe(-5);
    expect(metricValue({ kind: "int", raw: 127 }, 1)).toBe(127);
    expect(metricValue({ kind: "int", raw: 300 }, 1)).toBeUndefined();
    expect(metricValue({ kind: "int", raw: -300 >>> 0 }, 2)).toBe(-300);
    expect(metricValue({ kind: "int", raw: 65236 }, 2)).toBe(-300);
    expect(metricValue({ kind: "int", raw: 70000 }, 2)).toBeUndefined();
    expect(metricValue({ kind: "int", raw: 0xfffffffe }, 3)).toBe(-2);
    expect(metricValue({ kind: "int", raw: 4000000000 }, 7)).toBe(4000000000);
    expect(metricValue({ kind: "int", raw: 256 }, 5)).toBeUndefined();
  });

  it("reads 64-bit integers only when they stay exact", () => {
    const [m] = decodeSparkplugPayload(
      payload({ metrics: [{ name: "x", datatype: 4, long: -42n }] }),
    ).metrics;
    expect(metricValue(m.value!, 4)).toBe(-42);
    expect(
      metricValue({ kind: "long", raw: 2n ** 53n + 1n }, 8),
    ).toBeUndefined();
    expect(metricValue({ kind: "long", raw: 2n ** 63n }, 4)).toBeUndefined();
  });

  it("reads float, double, boolean and null metrics", () => {
    const metrics = decodeSparkplugPayload(
      payload({
        metrics: [
          { name: "f", datatype: 9, float: 0.25 },
          { name: "d", datatype: 10, double: -2.5 },
          { name: "b", datatype: 11, bool: true },
          { name: "n", datatype: 9, isNull: true },
        ],
      }),
    ).metrics;
    expect(
      metrics.map((m) => (m.value ? metricValue(m.value, m.datatype!) : null)),
    ).toEqual([0.25, -2.5, true, null]);
    expect(metrics[3].isNull).toBe(true);
    expect(metricValue({ kind: "boolean", raw: true }, 3)).toBeUndefined();
  });

  it("refuses malformed payloads", () => {
    for (const bad of [
      Buffer.from([0x08, 0x80]), // truncated varint
      Buffer.from([0x12, 0x05, 0x0a]), // length beyond payload
      bytes(2, num(12, 1)), // float field with a varint wire type
      Buffer.from([0x0b]), // group wire type
      bytes(2, bytes(1, Buffer.from([0xff, 0xfe]))), // invalid UTF-8 name
      num(3, 256), // sequence above 255
    ])
      expect(() => decodeSparkplugPayload(bad)).toThrow();
    const { message } = listener();
    const parsed = parseSparkplugMessage(
      source,
      mappings,
      createSparkplugState(mappings),
      "spBv1.0/Plant/NDATA/Line1",
      Buffer.from([0x08, 0x80]),
      new Date(T),
    );
    expect(parsed).toEqual({
      measurements: [],
      rejected: "Payload is not a Sparkplug B protobuf",
    });
    const huge = parseSparkplugMessage(
      source,
      mappings,
      createSparkplugState(mappings),
      "spBv1.0/Plant/NDATA/Line1",
      Buffer.alloc(262145),
      new Date(T),
    );
    expect(huge.rejected).toBe("Payload exceeds 256 KiB");
    expect(message("NCMD", { metrics: [] }).rejected).toBe("Unmapped topic");
  });
});

describe("Sparkplug B session state", () => {
  it("accepts named metrics before a birth and refuses alias-only ones", () => {
    const { message, status } = listener();
    expect(status()).toEqual({
      "Plant/Line1": "waiting for birth",
      "Plant/Line1/Press": "waiting for birth",
    });
    const r = message("NDATA", {
      timestamp: T,
      seq: 5,
      metrics: [
        { name: "Count", int: 11 },
        { alias: 2, double: 3 },
      ],
    });
    expect(r.rows).toEqual([["Count", 11, "Good"]]);
    expect(r.rejected).toBe(
      "Alias-only metric while waiting for a birth certificate",
    );
  });

  it("stores birth values and resolves aliases through a 255 to 0 wrap and duplicates", () => {
    const { message, status } = listener();
    expect(message("NBIRTH", nbirth(254)).rows).toEqual([
      ["Count", 10, "Good"],
      ["Speed", 1.5, "Good"],
    ]);
    expect(
      message("NDATA", {
        timestamp: T + 1000,
        seq: 255,
        metrics: [{ alias: 1, int: 12 }],
      }).rows,
    ).toEqual([["Count", 12, "Good"]]);
    const wrapped = message("NDATA", {
      timestamp: T + 2000,
      seq: 0,
      metrics: [{ alias: 2, double: 2 }],
    });
    expect(wrapped.rows).toEqual([["Speed", 2, "Good"]]);
    // A redelivered message repeats its sequence number and keeps its identity.
    const again = message("NDATA", {
      timestamp: T + 2000,
      seq: 0,
      metrics: [{ alias: 2, double: 2 }],
    });
    expect(again.rows).toEqual(wrapped.rows);
    expect(again.measurements[0].eventId).toBe(wrapped.measurements[0].eventId);
    expect(status()["Plant/Line1"]).toBe("born");
  });

  it("stops trusting aliases after a sequence gap until the next birth", () => {
    const { message, status } = listener();
    message("NBIRTH", nbirth());
    const gap = message("NDATA", {
      timestamp: T + 1000,
      seq: 3,
      metrics: [
        { alias: 1, int: 12 },
        { name: "Speed", double: 4 },
      ],
    });
    expect(gap.rows).toEqual([["Speed", 4, "Good"]]);
    expect(gap.rejected).toBe(
      "Alias-only metric after a sequence gap: waiting for the next birth",
    );
    expect(status()["Plant/Line1"]).toBe("sequence gap");
    // A rebirth may reassign aliases; the new assignment wins.
    message("NBIRTH", nbirth(0, 2n, 2, 1));
    expect(
      message("NDATA", {
        timestamp: T + 3000,
        seq: 1,
        metrics: [{ alias: 1, double: 5 }],
      }).rows,
    ).toEqual([["Speed", 5, "Good"]]);
  });

  it("counts device messages of unmapped devices in the node sequence", () => {
    const { message } = listener();
    message("NBIRTH", nbirth());
    message(
      "DBIRTH",
      {
        timestamp: T,
        seq: 1,
        metrics: [{ name: "Other", alias: 9, datatype: 3, int: 1 }],
      },
      "Robot",
    );
    message(
      "DDATA",
      { timestamp: T, seq: 2, metrics: [{ alias: 9, int: 2 }] },
      "Robot",
    );
    expect(
      message("NDATA", {
        timestamp: T,
        seq: 3,
        metrics: [{ alias: 1, int: 13 }],
      }).rows,
    ).toEqual([["Count", 13, "Good"]]);
  });

  it("reads device births and data, and marks a device death unknown", () => {
    const { message, status } = listener();
    message("NBIRTH", nbirth());
    expect(
      message(
        "DBIRTH",
        {
          timestamp: T,
          seq: 1,
          metrics: [
            { name: "Pressure", alias: 20, datatype: 9, float: 2.5 },
            { name: "Temp", alias: 21, datatype: 1, int: 251 },
          ],
        },
        "Press",
      ).rows,
    ).toEqual([
      ["Pressure", 2.5, "Good"],
      ["Temp", -5, "Good"],
    ]);
    // The birth's Int8 datatype still applies when data omits it.
    expect(
      message(
        "DDATA",
        { timestamp: T + 1000, seq: 2, metrics: [{ alias: 21, int: 250 }] },
        "Press",
      ).rows,
    ).toEqual([["Temp", -6, "Good"]]);
    const death = message(
      "DDEATH",
      { timestamp: T + 5000, seq: 3, metrics: [] },
      "Press",
    );
    expect(death.rows).toEqual([
      ["Pressure", null, "BadCommunicationError"],
      ["Temp", null, "BadCommunicationError"],
    ]);
    expect(death.measurements[0].timestamp).toEqual(new Date(T + 5000));
    expect(status()).toEqual({
      "Plant/Line1": "born",
      "Plant/Line1/Press": "offline",
    });
    expect(
      message(
        "DDATA",
        { timestamp: T + 6000, seq: 4, metrics: [{ alias: 21, int: 1 }] },
        "Press",
      ).rejected,
    ).toBe("Alias-only metric while waiting for a birth certificate");
  });

  it("ignores a stale node death and marks a matching one unknown", () => {
    const { message, status } = listener();
    message("NBIRTH", nbirth(0, 5n));
    message(
      "DBIRTH",
      {
        timestamp: T,
        seq: 1,
        metrics: [{ name: "Pressure", alias: 20, datatype: 9, float: 1 }],
      },
      "Press",
    );
    expect(
      message("NDEATH", {
        metrics: [{ name: "bdSeq", datatype: 8, long: 4n }],
      }),
    ).toMatchObject({ measurements: [], rejected: null });
    expect(status()["Plant/Line1"]).toBe("born");
    const death = message("NDEATH", {
      metrics: [{ name: "bdSeq", datatype: 8, long: 5n }],
    });
    expect(death.rows).toEqual([
      ["Count", null, "BadCommunicationError"],
      ["Speed", null, "BadCommunicationError"],
      ["Pressure", null, "BadCommunicationError"],
      ["Temp", null, "BadCommunicationError"],
    ]);
    expect(death.measurements[0].timestamp).toEqual(new Date(T + 60000));
    expect(status()).toEqual({
      "Plant/Line1": "offline",
      "Plant/Line1/Press": "offline",
    });
  });

  it("stores null and wrongly typed values as bad and refuses readings without time", () => {
    const { message } = listener();
    message("NBIRTH", nbirth());
    const r = message("NDATA", {
      seq: 1,
      metrics: [
        { alias: 1, timestamp: T, isNull: true },
        { name: "Speed", timestamp: T, datatype: 12, string: "fast" },
        { name: "Count", int: 3 },
      ],
    });
    expect(r.rows).toEqual([
      ["Count", null, "BadNoData"],
      ["Speed", null, "BadDecodingError"],
    ]);
    expect(r.rejected).toBe("No source timestamp for Count");
    expect(r.measurements[0].signalMetadata?.identifier).toBe(
      "spBv1.0/Plant/Line1#Count",
    );
  });

  it("subscribes only to the birth, data and death topics of mapped edge nodes", () => {
    expect(sparkplugTopics(mappings)).toEqual([
      "spBv1.0/Plant/NBIRTH/Line1",
      "spBv1.0/Plant/NDATA/Line1",
      "spBv1.0/Plant/NDEATH/Line1",
      "spBv1.0/Plant/DBIRTH/Line1/+",
      "spBv1.0/Plant/DDATA/Line1/+",
      "spBv1.0/Plant/DDEATH/Line1/+",
    ]);
  });
});
