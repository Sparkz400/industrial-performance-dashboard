import { describe, it, expect } from "vitest";
import type {
  DerivedObservation,
  DerivedSpecification,
  SignalExpression,
} from "@performance-dashboard/shared";
import {
  evaluateDerived,
  validateDerivedSpecification,
} from "../services/derivedSignalExpression.js";
const at = new Date("2026-01-01T00:01:00Z");
const leaf = (key: string, unit = "1"): SignalExpression => ({
  kind: "input",
  key,
  unit: unit as "1",
  namespaceUri: "urn:fixture",
  identifier: key,
});
const observation = (
  key: string,
  value: number | null,
  extra = {},
): DerivedObservation => ({
  measurementId: 1,
  eventId: "event",
  correctionRevision: 0,
  key,
  value,
  rawValue: value,
  timestamp: at.toISOString(),
  receivedAt: at.toISOString(),
  sourceTimestamp: at.toISOString(),
  statusCode: "Good",
  namespaceUri: "urn:fixture",
  identifier: key,
  ...extra,
});
const spec = (
  kind: "add" | "divide" | "multiply" = "divide",
  a = "kWh",
  b = "count",
): DerivedSpecification => ({
  expression: { kind, left: leaf("energy", a), right: leaf("parts", b) },
  maxAgeSeconds: 60,
});
describe("derived numeric evidence", () => {
  it("converts compatible units and retains zero and raw correction evidence", () => {
    const definition = spec("add", "Wh", "kWh");
    validateDerivedSpecification(definition);
    const rows = new Map([
      ["energy", observation("energy", 1000)],
      [
        "parts",
        observation("parts", 0, {
          rawValue: 8,
          correctionRevision: 2,
          statusCode: "GoodManualCorrection",
        }),
      ],
    ]);
    const result = evaluateDerived(definition, rows, at);
    expect(result.value).toBe(1);
    expect(result.unit).toBe("kWh");
    expect(result.inputs[1].rawValue).toBe(8);
    expect(result.inputs[1].correctionRevision).toBe(2);
  });
  it("rejects incompatible sums, unknown fields, executable strings and excess depth", () => {
    expect(() => validateDerivedSpecification(spec("add"))).toThrow();
    expect(() =>
      validateDerivedSpecification({ ...spec(), execute: "process.exit()" }),
    ).toThrow();
    expect(() =>
      validateDerivedSpecification({ ...spec(), expression: "2+2" }),
    ).toThrow();
    let expression: SignalExpression = leaf("energy");
    for (let i = 0; i < 10; i++)
      expression = { kind: "add", left: expression, right: leaf("energy") };
    expect(() =>
      validateDerivedSpecification({ expression, maxAgeSeconds: 60 }),
    ).toThrow();
  });
  it("propagates missing, bad, stale, future and changed identity", () => {
    for (const extra of [
      { statusCode: "Bad" },
      { timestamp: "2025-12-31T23:59:59Z" },
      { timestamp: "2026-01-01T00:01:01Z" },
      { namespaceUri: "urn:changed" },
      { value: null },
      { sourceTimestamp: "2026-01-01T00:05:00Z" },
    ]) {
      const result = evaluateDerived(
        spec(),
        new Map([
          ["energy", observation("energy", 5, extra)],
          ["parts", observation("parts", 2)],
        ]),
        at,
      );
      expect(result.value).toBeNull();
      expect(result.quality).toBe("unknown");
      expect(result.reasons.length).toBeGreaterThan(0);
    }
    expect(evaluateDerived(spec(), new Map(), at).value).toBeNull();
  });
  it("does not manufacture a zero result for missing inputs or divide by zero", () => {
    const result = evaluateDerived(
      spec(),
      new Map([
        ["energy", observation("energy", 0)],
        ["parts", observation("parts", 0)],
      ]),
      at,
    );
    expect(result.value).toBeNull();
    expect(result.reasons).toContain("Division by zero");
    const valid = evaluateDerived(
      spec(),
      new Map([
        ["energy", observation("energy", 0)],
        ["parts", observation("parts", 2)],
      ]),
      at,
    );
    expect(valid.value).toBe(0);
    expect(valid.quality).toBe("good");
  });
  it("rejects contradictory units for the same input", () => {
    expect(() =>
      validateDerivedSpecification({
        expression: {
          kind: "divide",
          left: leaf("same", "kWh"),
          right: leaf("same", "count"),
        },
        maxAgeSeconds: 60,
      }),
    ).toThrow();
  });
  it("evaluates deterministically and expires carried values at the exact boundary", () => {
    const rows = new Map([
      ["energy", observation("energy", 5)],
      ["parts", observation("parts", 2)],
    ]);
    expect(
      evaluateDerived(spec(), rows, new Date(at.getTime() + 60000)).value,
    ).toBe(2.5);
    expect(
      evaluateDerived(spec(), rows, new Date(at.getTime() + 60001)).value,
    ).toBeNull();
    expect(evaluateDerived(spec(), rows, at)).toEqual(
      evaluateDerived(spec(), rows, at),
    );
  });
});
