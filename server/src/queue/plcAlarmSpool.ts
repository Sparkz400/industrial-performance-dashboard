import { DatabaseSync } from "node:sqlite";
import { mkdirSync, statfsSync } from "node:fs";
import { dirname } from "node:path";
import type { plcAlarmEvents } from "../database/schema.js";

type Alarm = typeof plcAlarmEvents.$inferInsert;

/** Keep received transitions until PostgreSQL confirms their idempotent insert. */
export class PlcAlarmSpool {
  private database: DatabaseSync;

  constructor(
    private filename: string,
    private limits: { maxEntries: number; minFreeBytes: number },
  ) {
    mkdirSync(dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY, machine_id INTEGER NOT NULL,
        event_id TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(machine_id,event_id)
      );
    `);
  }

  count(machineId?: number): number {
    const row =
      machineId == null
        ? this.database.prepare("SELECT count(*) n FROM events").get()
        : this.database
            .prepare("SELECT count(*) n FROM events WHERE machine_id=?")
            .get(machineId);
    return Number(row!.n);
  }

  enqueue(row: Alarm): void {
    if (
      this.database
        .prepare("SELECT 1 FROM events WHERE machine_id=? AND event_id=?")
        .get(row.machineId, row.eventId)
    )
      return;
    const disk = statfsSync(dirname(this.filename));
    if (
      this.count() >= this.limits.maxEntries ||
      disk.bavail * disk.bsize < this.limits.minFreeBytes
    )
      throw new Error(
        "PLC alarm spool capacity exhausted; unreceived transitions are unknown",
      );
    this.database
      .prepare(
        "INSERT OR IGNORE INTO events(machine_id,event_id,payload) VALUES(?,?,?)",
      )
      .run(
        row.machineId,
        row.eventId,
        JSON.stringify({ ...row, receivedAt: row.receivedAt ?? new Date() }),
      );
  }

  async flush(store: (rows: Alarm[]) => Promise<unknown>): Promise<void> {
    const entries = this.database
      .prepare(
        "SELECT sequence,payload FROM events ORDER BY sequence LIMIT 100",
      )
      .all();
    if (!entries.length) return;
    const rows = entries.map(({ payload }) => {
      const row = JSON.parse(String(payload));
      return {
        ...row,
        eventTime: new Date(row.eventTime),
        receiveTime: row.receiveTime ? new Date(row.receiveTime) : null,
        receivedAt: new Date(row.receivedAt),
      } as Alarm;
    });
    await store(rows);
    this.database
      .prepare("DELETE FROM events WHERE sequence <= ?")
      .run(entries.at(-1)!.sequence);
  }

  close(): void {
    this.database.close();
  }
}
