import { DatabaseSync } from "node:sqlite";
import { mkdirSync, statSync, statfsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { SignalMetadata } from "@performance-dashboard/shared";

export interface OpcuaDataItem {
  key: string;
  label: string;
  timestamp: Date | string | number;
  sourceTimestamp?: Date | string | null;
  receivedAt?: Date | string;
  signalMetadata?: SignalMetadata;
  value: number | string | boolean | null;
  statusCode?: string;
  dataType?: string;
  machineId?: number;
  /** Deterministic identity from a redelivering source; a repeat is stored once. */
  eventId?: string;
}

export interface SpoolEntry {
  id: string;
  data: OpcuaDataItem;
}

/** Acknowledged measurements survive process restarts and database outages. */
export class MeasurementSpool {
  private database: DatabaseSync;

  constructor(
    private filename: string,
    private limits = { maxEntries: 1_000_000, minFreeBytes: 64 * 1024 * 1024 },
  ) {
    mkdirSync(dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS measurements (
        sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS measurements_machine ON measurements(json_extract(payload, '$.machineId'));
      CREATE TABLE IF NOT EXISTS quarantine (
        sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
        reason TEXT NOT NULL, quarantined_at TEXT NOT NULL
      );
    `);
  }

  private transaction(work: () => void): void {
    this.database.exec("BEGIN");
    try {
      work();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  /** Move a record PostgreSQL refuses out of the write path; it stays on disk. */
  quarantine(entry: SpoolEntry, reason: string): void {
    this.transaction(() => {
      this.database
        .prepare(
          "INSERT OR IGNORE INTO quarantine(id, payload, reason, quarantined_at) SELECT id, payload, ?, ? FROM measurements WHERE id = ?",
        )
        .run(reason, new Date().toISOString(), entry.id);
      this.database
        .prepare("DELETE FROM measurements WHERE id = ?")
        .run(entry.id);
    });
  }

  quarantined(limit: number) {
    return this.database
      .prepare(
        "SELECT id, payload, reason, quarantined_at FROM quarantine ORDER BY sequence LIMIT ?",
      )
      .all(limit)
      .map((row) => ({
        id: String(row.id),
        data: JSON.parse(String(row.payload)) as OpcuaDataItem,
        reason: String(row.reason),
        quarantinedAt: String(row.quarantined_at),
      }));
  }

  /** Return quarantined records to the queue under their original IDs (late arrivals). */
  requeueQuarantined(): number {
    let moved = 0;
    this.transaction(() => {
      moved = Number(
        this.database
          .prepare(
            "INSERT OR IGNORE INTO measurements(id, payload) SELECT id, payload FROM quarantine ORDER BY sequence",
          )
          .run().changes,
      );
      this.database.exec("DELETE FROM quarantine");
    });
    return moved;
  }

  enqueue(data: OpcuaDataItem): void {
    if (this.count() >= this.limits.maxEntries)
      throw new Error(
        "Measurement storage capacity reached; collection must stop",
      );
    if (this.filename !== ":memory:") {
      const space = statfsSync(dirname(this.filename));
      if (space.bavail * space.bsize < this.limits.minFreeBytes)
        throw new Error(
          "Measurement storage reserve reached; collection must stop",
        );
    }
    if (!data.key || !Number.isFinite(new Date(data.timestamp).getTime())) {
      throw new Error("Invalid measurement key or timestamp");
    }
    if (
      data.value !== null &&
      !["number", "string", "boolean"].includes(typeof data.value)
    ) {
      throw new Error("Only scalar OPC UA values are supported");
    }
    if (typeof data.value === "number" && !Number.isFinite(data.value)) {
      throw new Error("Measurement must be finite");
    }
    for (const time of [data.sourceTimestamp, data.receivedAt]) {
      if (time != null && !Number.isFinite(new Date(time).getTime())) {
        throw new Error("Invalid measurement source or receive timestamp");
      }
    }
    if (
      data.eventId !== undefined &&
      !/^[A-Za-z0-9:_-]{1,100}$/.test(data.eventId)
    )
      throw new Error("Invalid measurement event identity");
    const { eventId, ...payload } = data;
    // A redelivered event that is still pending is already durable; keep the first copy.
    this.database
      .prepare("INSERT OR IGNORE INTO measurements(id, payload) VALUES (?, ?)")
      .run(
        eventId ?? randomUUID(),
        JSON.stringify({
          ...payload,
          receivedAt: payload.receivedAt ?? new Date().toISOString(),
        }),
      );
  }

  peek(limit: number): SpoolEntry[] {
    return this.database
      .prepare("SELECT id, payload FROM measurements ORDER BY sequence LIMIT ?")
      .all(limit)
      .map((row) => ({
        id: String(row.id),
        data: JSON.parse(String(row.payload)),
      }));
  }

  count(): number {
    return Number(
      this.database.prepare("SELECT count(*) AS count FROM measurements").get()!
        .count,
    );
  }

  machineHealth(machineId: number) {
    const row = this.database
      .prepare(
        "SELECT count(*) AS pending,min(json_extract(payload,'$.receivedAt')) AS oldest,sum(CASE WHEN json_extract(payload,'$.receivedAt') IS NULL THEN 1 ELSE 0 END) AS unknown FROM measurements WHERE json_extract(payload,'$.machineId')=?",
      )
      .get(machineId)!;
    return {
      pending: Number(row.pending),
      oldestReceivedAt: typeof row.oldest === "string" ? row.oldest : null,
      unknownReceiveTimes: Number(row.unknown ?? 0),
    };
  }

  health() {
    const row = this.database
      .prepare(
        "SELECT min(json_extract(payload, '$.receivedAt')) AS oldest, sum(CASE WHEN json_extract(payload, '$.receivedAt') IS NULL THEN 1 ELSE 0 END) AS unknown FROM measurements",
      )
      .get()!;
    const oldestReceivedAt = typeof row.oldest === "string" ? row.oldest : null;
    const space =
      this.filename === ":memory:" ? null : statfsSync(dirname(this.filename));
    const spoolBytes =
      this.filename === ":memory:"
        ? null
        : [this.filename, `${this.filename}-wal`].reduce(
            (sum, file) =>
              sum + (statSync(file, { throwIfNoEntry: false })?.size ?? 0),
            0,
          );
    return {
      pendingMeasurements: this.count(),
      capacityMeasurements: this.limits.maxEntries,
      quarantinedMeasurements: Number(
        this.database.prepare("SELECT count(*) AS count FROM quarantine").get()!
          .count,
      ),
      spoolBytes,
      oldestReceivedAt,
      oldestReceivedAgeSeconds: oldestReceivedAt
        ? Math.max(0, (Date.now() - Date.parse(oldestReceivedAt)) / 1000)
        : null,
      unknownReceiveTimes: Number(row.unknown ?? 0),
      freeStorageBytes: space ? space.bavail * space.bsize : null,
      storageReserveBytes: this.limits.minFreeBytes,
    };
  }

  acknowledge(entries: SpoolEntry[]): void {
    const remove = this.database.prepare(
      "DELETE FROM measurements WHERE id = ?",
    );
    this.transaction(() => {
      for (const entry of entries) remove.run(entry.id);
    });
  }

  close(): void {
    this.database.close();
  }
}

export function toMeasurementRow({ id, data }: SpoolEntry) {
  const reportedStatusCode = data.statusCode ?? "Uncertain";
  const receivedAt = data.receivedAt ? new Date(data.receivedAt) : null;
  const times = [
    new Date(data.timestamp),
    ...(data.sourceTimestamp ? [new Date(data.sourceTimestamp)] : []),
  ];
  const future =
    receivedAt != null &&
    times.some((time) => time.getTime() > receivedAt.getTime() + 300_000);
  const sourceClockState =
    receivedAt == null ? "unknown" : future ? "future" : "not-future";
  const statusCode = future ? "BadSourceClock" : reportedStatusCode;
  const numericValue =
    typeof data.value === "boolean" ? Number(data.value) : data.value;
  return {
    eventId: id,
    nodeKey: data.key,
    nodeLabel: data.label,
    timestamp: new Date(data.timestamp),
    sourceTimestamp: data.sourceTimestamp
      ? new Date(data.sourceTimestamp)
      : null,
    receivedAt,
    signalMetadata: data.signalMetadata ?? null,
    value:
      statusCode.startsWith("Good") && typeof numericValue === "number"
        ? numericValue
        : null,
    rawValue: data.value,
    statusCode,
    reportedStatusCode,
    sourceClockState,
    dataType: data.dataType ?? null,
    machineId: data.machineId ?? null,
  };
}
