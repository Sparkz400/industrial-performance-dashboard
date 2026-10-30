import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlcAlarmSpool } from "../../queue/plcAlarmSpool.js";

it("preserves alarms through failed writes, reopen and uncertain PostgreSQL acknowledgments", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pd-alarm-spool-"));
  const filename = join(directory, "alarms.sqlite");
  const limits = { maxEntries: 2, minFreeBytes: 0 };
  let spool = new PlcAlarmSpool(filename, limits);
  const alarm = {
    machineId: 1,
    eventId: "original",
    eventType: "Alarm",
    eventTime: new Date("2026-10-30T00:00:00Z"),
    severity: 700,
    refresh: false,
  };
  try {
    spool.enqueue(alarm);
    spool.enqueue(alarm);
    expect(spool.count(1)).toBe(1);
    await expect(
      spool.flush(async () => {
        throw new Error("database unavailable");
      }),
    ).rejects.toThrow("unavailable");
    spool.close();
    spool = new PlcAlarmSpool(filename, limits);
    const stored = new Map();
    let receivedAt: Date | undefined;
    await expect(
      spool.flush(async (rows) => {
        receivedAt = rows[0].receivedAt!;
        stored.set(rows[0].eventId, rows[0]);
        throw new Error("acknowledgment lost after commit");
      }),
    ).rejects.toThrow("acknowledgment lost");
    expect(spool.count()).toBe(1);
    await spool.flush(async (rows) => {
      expect(rows[0].receivedAt).toEqual(receivedAt);
      expect(rows[0].eventTime).toEqual(alarm.eventTime);
      stored.set(rows[0].eventId, rows[0]);
    });
    expect(stored.size).toBe(1);
    expect(spool.count()).toBe(0);
    spool.enqueue(alarm);
    spool.enqueue({ ...alarm, eventId: "second" });
    spool.enqueue(alarm);
    expect(() => spool.enqueue({ ...alarm, eventId: "third" })).toThrow(
      "capacity",
    );
    expect(spool.count()).toBe(2);
  } finally {
    spool.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
