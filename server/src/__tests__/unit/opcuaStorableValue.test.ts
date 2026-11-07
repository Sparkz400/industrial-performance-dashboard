import { describe, expect, it, vi } from "vitest";
vi.mock("../../database/db.js", () => ({ default: {} }));
import { storableValue } from "../../opc-ua/opcuaClient.js";
import { MeasurementSpool } from "../../queue/measurementSpool.js";

const good = "Good (0x00000000)";

describe("OPC UA values the spool can store", () => {
  it("keeps finite scalars and their status", () => {
    expect(storableValue(41, "Int32", good)).toEqual({
      value: 41,
      statusCode: good,
    });
    expect(storableValue(true, "Boolean", good).value).toBe(true);
    expect(storableValue("PART-7", "String", good).value).toBe("PART-7");
    expect(storableValue(null, "Null", "BadNoCommunication")).toEqual({
      value: null,
      statusCode: "BadNoCommunication",
    });
  });

  it("converts 64-bit counters and marks values beyond the safe range unknown", () => {
    // node-opcua delivers Int64/UInt64 as [high, low].
    expect(storableValue([0, 42], "UInt64", good).value).toBe(42);
    expect(storableValue([1, 0], "UInt64", good).value).toBe(4294967296);
    expect(storableValue([0xffffffff, 0xffffffff], "Int64", good).value).toBe(
      -1,
    );
    expect(storableValue([0xffffffff, 0xffffffff], "UInt64", good)).toEqual({
      value: "18446744073709551615",
      statusCode: "BadOutOfRange",
    });
  });

  it("turns NaN, Infinity and structures into unknown samples", () => {
    expect(storableValue(Number.NaN, "Double", good)).toEqual({
      value: "NaN",
      statusCode: "BadOutOfRange",
    });
    expect(storableValue(Infinity, "Float", good).statusCode).toBe(
      "BadOutOfRange",
    );
    expect(storableValue([1, 2, 3], "Double", good)).toEqual({
      value: null,
      statusCode: "BadTypeMismatch",
    });
    expect(
      storableValue({ text: "x" }, "LocalizedText", good).value,
    ).toBeNull();
    // An already Bad status is not replaced.
    expect(
      storableValue(Number.NaN, "Double", "BadSensorFailure").statusCode,
    ).toBe("BadSensorFailure");
  });

  it("lets the spool accept every result, so one value cannot stop collection", () => {
    const spool = new MeasurementSpool(":memory:");
    try {
      for (const [value, type] of [
        [Number.NaN, "Double"],
        [[0xffffffff, 0xffffffff], "UInt64"],
        [[1, 2, 3], "Double"],
        [{ text: "x" }, "LocalizedText"],
      ] as const)
        spool.enqueue({
          key: "K",
          label: "K",
          timestamp: new Date(),
          ...storableValue(value, type, good),
        });
      expect(spool.health().pendingMeasurements).toBe(4);
    } finally {
      spool.close();
    }
  });
});
