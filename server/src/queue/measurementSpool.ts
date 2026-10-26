import { DatabaseSync } from "node:sqlite";
import { mkdirSync, statfsSync } from "node:fs";
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
    `);
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
    this.database
      .prepare("INSERT INTO measurements(id, payload) VALUES (?, ?)")
      .run(
        randomUUID(),
        JSON.stringify({
          ...data,
          receivedAt: data.receivedAt ?? new Date().toISOString(),
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

  acknowledge(entries: SpoolEntry[]): void {
    const remove = this.database.prepare(
      "DELETE FROM measurements WHERE id = ?",
    );
    this.database.exec("BEGIN");
    try {
      for (const entry of entries) remove.run(entry.id);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

export function toMeasurementRow({ id, data }: SpoolEntry) {
  const statusCode = data.statusCode ?? "Uncertain";
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
    receivedAt: data.receivedAt ? new Date(data.receivedAt) : null,
    signalMetadata: data.signalMetadata ?? null,
    value:
      statusCode.startsWith("Good") && typeof numericValue === "number"
        ? numericValue
        : null,
    rawValue: data.value,
    statusCode,
    dataType: data.dataType ?? null,
    machineId: data.machineId ?? null,
  };
}
