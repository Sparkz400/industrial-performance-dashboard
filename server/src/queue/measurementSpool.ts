import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface OpcuaDataItem {
  key: string;
  label: string;
  timestamp: Date | string | number;
  sourceTimestamp?: Date | string | null;
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

  constructor(filename: string) {
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
    this.database
      .prepare("INSERT INTO measurements(id, payload) VALUES (?, ?)")
      .run(randomUUID(), JSON.stringify(data));
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
