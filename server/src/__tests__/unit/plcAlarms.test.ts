import { expect, it, vi } from "vitest";
import * as opcua from "node-opcua";

vi.mock("../../database/db.js", () => ({ default: {} }));
vi.mock("../../opc-ua/opcuaClient.js", () => ({ certificateManager: {} }));
const { plcSeverity, eventRow, EVENT_FIELDS } =
  await import("../../services/plcAlarms.js");

const variant = (dataType: opcua.DataType, value: unknown) =>
  new opcua.Variant({ dataType, value });
const values = (
  patch: Partial<Record<(typeof EVENT_FIELDS)[number], opcua.Variant>>,
) =>
  EVENT_FIELDS.map(
    (field) =>
      patch[field] ?? new opcua.Variant({ dataType: opcua.DataType.Null }),
  );

it("maps OPC UA severity bands onto the application scale", () => {
  expect([1, 200, 201, 400, 600, 700, 800, 801, 1000].map(plcSeverity)).toEqual(
    [
      "info",
      "info",
      "low",
      "low",
      "medium",
      "high",
      "high",
      "critical",
      "critical",
    ],
  );
});

it("keeps condition identity and states, and stores information-only events too", () => {
  const time = new Date("2026-06-01T06:00:00Z");
  const condition = eventRow(
    3,
    values({
      EventId: variant(opcua.DataType.ByteString, Buffer.from([0xab, 0x01])),
      EventType: variant(
        opcua.DataType.NodeId,
        opcua.resolveNodeId("AlarmConditionType"),
      ),
      SourceName: variant(opcua.DataType.String, "Press"),
      Time: variant(opcua.DataType.DateTime, time),
      Message: variant(
        opcua.DataType.LocalizedText,
        new opcua.LocalizedText({ text: "Pressure high" }),
      ),
      Severity: variant(opcua.DataType.UInt16, 700),
      ConditionId: variant(
        opcua.DataType.NodeId,
        opcua.coerceNodeId("ns=1;i=1002"),
      ),
      "ActiveState.Id": variant(opcua.DataType.Boolean, true),
      "AckedState.Id": variant(opcua.DataType.Boolean, false),
      Retain: variant(opcua.DataType.Boolean, true),
    }),
    true,
  );
  expect(condition).toMatchObject({
    machineId: 3,
    eventId: "ab01",
    conditionId: "ns=1;i=1002",
    sourceName: "Press",
    eventTime: time,
    severity: 700,
    message: "Pressure high",
    active: true,
    acked: false,
    retain: true,
    refresh: true,
  });
  const information = eventRow(
    3,
    values({
      EventId: variant(opcua.DataType.ByteString, Buffer.from([1])),
      EventType: variant(
        opcua.DataType.NodeId,
        opcua.resolveNodeId("BaseEventType"),
      ),
      Severity: variant(opcua.DataType.UInt16, 100),
    }),
    false,
  );
  expect(information).toMatchObject({
    conditionId: null,
    active: null,
    severity: 100,
  });
  expect(eventRow(3, values({}), false)).toBeNull();
});
