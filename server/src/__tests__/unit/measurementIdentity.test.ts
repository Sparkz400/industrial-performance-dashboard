import { expect, it } from "vitest";
import { measurementIdentity } from "../../opc-ua/measurementIdentity.js";

it("uses namespace URI and machine identity, not alias or namespace index", () => {
  const mapping = {
    nodeId: "ns=1;s=Temperature",
    dataType: "Double",
    label: "Temperature",
  };
  const a = measurementIdentity(
    "opc.tcp://owned:4841",
    1,
    "Temperature",
    mapping,
    ["core", "urn:machine"],
    "C",
  );
  const moved = measurementIdentity(
    "opc.tcp://owned:4841",
    1,
    "Temperature",
    { ...mapping, nodeId: "ns=2;s=Temperature" },
    ["core", "other", "urn:machine"],
    "C",
  );
  const b = measurementIdentity(
    "opc.tcp://owned:4841",
    2,
    "Temperature",
    mapping,
    ["core", "urn:machine"],
    "C",
  );
  expect(a.signalId).toBe(moved.signalId);
  expect(a.mappingRevision).toBe(moved.mappingRevision);
  expect(a.signalId).not.toBe(b.signalId);
  expect(() =>
    measurementIdentity("owned", 1, "T", mapping, ["core"], null),
  ).toThrow("namespace");
});
