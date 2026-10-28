import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import manager from "../database/dbConnection.js";
import config from "../config/config.js";
import { canonicalJson } from "../utils/canonicalJson.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";

export interface CorrectionInput {
  requestId: string;
  measurementId: number;
  timestamp: string;
  expectedRevision: number;
  value: number | null;
  quality: "good" | "bad";
  reason: string;
}

export function validateCorrection(input: CorrectionInput) {
  if (!input.reason.trim() || input.reason.length > 1000)
    throw new ValidationError(
      "Explain the correction in at most 1000 characters",
    );
  if (
    (input.value !== null && !Number.isFinite(input.value)) ||
    (input.quality === "good" && input.value === null) ||
    (input.quality === "bad" && input.value !== null)
  )
    throw new ValidationError(
      "Good corrections require a finite value; bad corrections require null",
    );
  return {
    value: input.value,
    statusCode:
      input.quality === "good" ? "GoodManualCorrection" : "BadManualCorrection",
  };
}

const seal = (
  actor: number,
  machine: number,
  input: CorrectionInput,
  before: unknown,
  expires: number,
) =>
  createHmac("sha256", config.SESSION_SECRET)
    .update(canonicalJson({ actor, machine, input, before, expires }))
    .digest("hex");

async function readMeasurement(
  connection: PoolClient,
  machineId: number,
  input: CorrectionInput,
  lock = false,
) {
  const row = (
    await connection.query(
      `SELECT * FROM opcua_data WHERE machine_id=$1 AND id=$2 AND timestamp=$3${lock ? " FOR UPDATE" : ""}`,
      [machineId, input.measurementId, input.timestamp],
    )
  ).rows[0];
  if (!row) throw new NotFoundError("Retained raw measurement");
  if (row.correction_revision !== input.expectedRevision)
    throw new ConflictError("Measurement changed; review a new preview");
  const received =
    row.received_at == null ? null : new Date(row.received_at).getTime();
  const futureClock =
    received !== null &&
    [row.timestamp, row.source_timestamp].some(
      (time) => time != null && new Date(time).getTime() > received + 300_000,
    );
  if (
    input.quality === "good" &&
    (row.source_clock_state === "future" || futureClock)
  )
    throw new ValidationError(
      "A future-clock record cannot be made good by changing its value",
    );
  if (
    input.value !== null &&
    (row.data_type === "String" || typeof row.raw_value === "string")
  )
    throw new ValidationError(
      "Text measurements cannot be corrected into numeric signals",
    );
  if (
    input.value !== null &&
    (row.data_type === "Boolean" || typeof row.raw_value === "boolean") &&
    ![0, 1].includes(input.value)
  )
    throw new ValidationError("Boolean corrections must be zero or one");
  return row;
}

export async function previewCorrection(
  machineId: number,
  actor: number,
  input: CorrectionInput,
) {
  const after = validateCorrection(input);
  const connection = await manager.pool.connect();
  try {
    const before = await readMeasurement(connection, machineId, input);
    const expires = Date.now() + 15 * 60_000;
    const shifts = (
      await connection.query(
        'SELECT id,name,start,"end" FROM production_shifts WHERE machine_id=$1 AND $2 >= start-interval \'1 hour\' AND $2 <= "end" ORDER BY start LIMIT 101',
        [machineId, input.timestamp],
      )
    ).rows;
    return {
      before,
      after,
      expires,
      token: seal(actor, machineId, input, before, expires),
      affectedShifts: shifts.slice(0, 100),
      shiftsTruncated: shifts.length > 100,
      notice:
        "Current calculations will be recomputed. Saved report revisions and recorded alarm decisions remain unchanged. Raw values, timestamps and event identity remain unchanged.",
    };
  } finally {
    connection.release();
  }
}

export async function applyCorrection(
  machineId: number,
  actor: number,
  input: CorrectionInput,
  expires: number,
  token: string,
  sessionVersion: string,
) {
  const after = validateCorrection(input);
  const connection = await manager.pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL statement_timeout='10s'");
    // Serialize identical intents before checking their durable receipt.
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      input.requestId,
    ]);
    const reviewer = (
      await connection.query(
        "SELECT updated_at FROM users WHERE id=$1 AND is_active AND role IN ('admin','supervisor') FOR SHARE",
        [actor],
      )
    ).rows[0];
    if (
      !reviewer ||
      new Date(reviewer.updated_at).toISOString() !== sessionVersion
    )
      throw new ForbiddenError(
        "Correction reviewer permissions changed; sign in and review again",
      );
    const existing = (
      await connection.query(
        "SELECT * FROM measurement_corrections WHERE id=$1",
        [input.requestId],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.machine_id !== machineId ||
        existing.created_by !== actor ||
        existing.measurement_id !== input.measurementId ||
        new Date(existing.measured_at).getTime() !==
          Date.parse(input.timestamp) ||
        existing.revision !== input.expectedRevision + 1 ||
        existing.reason !== input.reason ||
        existing.after.value !== after.value ||
        existing.after.statusCode !== after.statusCode
      )
        throw new ConflictError(
          "Correction identity was already used for a different request",
        );
      await connection.query("COMMIT");
      return existing;
    }
    const before = await readMeasurement(connection, machineId, input, true);
    if (
      !Number.isFinite(expires) ||
      expires < Date.now() ||
      expires > Date.now() + 15 * 60_000 ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(
        Buffer.from(token, "hex"),
        Buffer.from(seal(actor, machineId, input, before, expires), "hex"),
      )
    )
      throw new ConflictError("Preview expired or changed; review again");
    const revision = input.expectedRevision + 1;
    const receipt = (
      await connection.query(
        `INSERT INTO measurement_corrections(id,machine_id,measurement_id,measured_at,revision,"before","after",reason,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          input.requestId,
          machineId,
          input.measurementId,
          input.timestamp,
          revision,
          JSON.stringify(before),
          JSON.stringify(after),
          input.reason,
          actor,
        ],
      )
    ).rows[0];
    await connection.query(
      "UPDATE opcua_data SET reported_status_code=coalesce(reported_status_code,status_code),value=$4,status_code=$5,correction_revision=$6 WHERE machine_id=$1 AND id=$2 AND timestamp=$3",
      [
        machineId,
        input.measurementId,
        input.timestamp,
        after.value,
        after.statusCode,
        revision,
      ],
    );
    await connection.query("COMMIT");
    return receipt;
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
