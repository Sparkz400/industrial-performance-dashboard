import { beforeEach, describe, expect, it, vi } from "vitest";

// --- History retention: a stale or foreign preview must delete nothing. ---
const pg = vi.hoisted(() => {
  const queries: string[] = [];
  const answers = new Map<RegExp, unknown>();
  const client = {
    query: vi.fn(async (text: string) => {
      queries.push(text);
      for (const [pattern, answer] of answers)
        if (pattern.test(text)) return answer;
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return { queries, answers, client };
});
vi.mock("../../database/dbConnection.js", () => ({
  default: { pool: { connect: async () => pg.client } },
}));
vi.mock("../../services/auditLogService.js", () => ({
  auditLogService: { recordEvent: vi.fn() },
}));
import { applyRetention } from "../../services/historyRetention.js";
import { validateCorrection } from "../../services/measurementCorrections.js";

describe("history retention guard", () => {
  const preview = {
    id: "p1",
    machine_id: 7,
    created_by: 1,
    rows: 10,
    policy_version: 3,
    created_at: new Date().toISOString(),
    completed: false,
    deleted: 0,
  };
  beforeEach(() => {
    pg.queries.length = 0;
    pg.answers.clear();
    pg.answers.set(/FROM users/, { rows: [{ id: 1 }], rowCount: 1 });
    pg.answers.set(/FROM retention_policies/, { rows: [{ version: 3 }] });
  });
  const deletes = () =>
    pg.queries.filter((q) => /DELETE FROM opcua_data/.test(q));

  it.each([
    ["another reviewer", { created_by: 2 }, 10],
    ["a different row count than reviewed", {}, 11],
    ["a changed policy", { policy_version: 2 }, 10],
    [
      "an expired preview",
      { created_at: new Date(Date.now() - 3_700_000).toISOString() },
      10,
    ],
  ])("refuses %s and rolls back", async (_case, change, confirmRows) => {
    pg.answers.set(/FROM retention_previews/, {
      rows: [{ ...preview, ...change }],
    });
    await expect(applyRetention(7, "p1", confirmRows, 1)).rejects.toThrow(
      /new preview/,
    );
    expect(deletes()).toEqual([]);
    expect(pg.queries).toContain("ROLLBACK");
  });

  it("refuses a reviewer who lost administrator access", async () => {
    pg.answers.clear();
    pg.answers.set(/FROM users/, { rows: [], rowCount: 0 });
    await expect(applyRetention(7, "p1", 10, 1)).rejects.toThrow(
      /administrator/,
    );
    expect(deletes()).toEqual([]);
  });
});

describe("measurement correction validation", () => {
  const base = {
    requestId: "r",
    measurementId: 1,
    timestamp: "2026-01-01T00:00:00Z",
    expectedRevision: 0,
    reason: "Sensor swapped",
  };
  it("requires a reason and a value that matches the quality", () => {
    expect(() =>
      validateCorrection({ ...base, reason: " ", value: 1, quality: "good" }),
    ).toThrow();
    expect(() =>
      validateCorrection({ ...base, value: null, quality: "good" }),
    ).toThrow();
    expect(() =>
      validateCorrection({ ...base, value: Number.NaN, quality: "good" }),
    ).toThrow();
    expect(() =>
      validateCorrection({ ...base, value: 3, quality: "bad" }),
    ).toThrow();
    expect(validateCorrection({ ...base, value: 3, quality: "good" })).toEqual({
      value: 3,
      statusCode: "GoodManualCorrection",
    });
    expect(
      validateCorrection({ ...base, value: null, quality: "bad" }).statusCode,
    ).toBe("BadManualCorrection");
  });
});
