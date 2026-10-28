import { createHash } from "node:crypto";
import type {
  DerivedEvaluation,
  DerivedObservation,
  DerivedSignalDefinition,
  DerivedSpecification,
} from "@performance-dashboard/shared";
import manager from "../database/dbConnection.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../utils/errors.js";
import {
  evaluateDerived,
  expressionInputs,
  validateDerivedSpecification,
} from "./derivedSignalExpression.js";

const projection = `id, machine_id AS "machineId", name, version, expression, created_by AS "createdBy", created_at AS "createdAt"`;
export async function listDerivedSignals(machine: number, name?: string) {
  return (
    await manager.pool.query(
      name
        ? `SELECT ${projection} FROM derived_signal_definitions WHERE machine_id=$1 AND name=$2 ORDER BY version DESC LIMIT 100`
        : `SELECT DISTINCT ON(name) ${projection} FROM derived_signal_definitions WHERE machine_id=$1 ORDER BY name,version DESC LIMIT 100`,
      name ? [machine, name] : [machine],
    )
  ).rows;
}
export async function derivedInputs(machine: number) {
  return (
    await manager.pool.query(
      `SELECT DISTINCT ON (d.node_key) d.node_key AS key, d.signal_metadata->>'namespaceUri' AS "namespaceUri", d.signal_metadata->>'identifier' AS identifier, d.data_type AS "dataType" FROM opcua_data d JOIN node_mappings m ON m.machine_id=d.machine_id AND m.node_key=d.node_key WHERE d.machine_id=$1 AND d.signal_metadata IS NOT NULL ORDER BY d.node_key,d.timestamp DESC,d.id DESC LIMIT 200`,
      [machine],
    )
  ).rows;
}
export async function saveDerivedSignal(
  machine: number,
  actor: number,
  name: string,
  expectedVersion: number,
  input: unknown,
  userVersion: string | undefined,
) {
  const expression = validateDerivedSpecification(input);
  const inputs = expressionInputs(expression.expression);
  if (!inputs.length)
    throw new ValidationError(
      "A calculated signal must reference at least one measured input",
    );
  const available = await derivedInputs(machine);
  for (const leaf of inputs)
    if (
      !available.some(
        (row) =>
          row.key === leaf.key &&
          row.namespaceUri === leaf.namespaceUri &&
          row.identifier === leaf.identifier,
      )
    )
      throw new ValidationError(
        "Select measured inputs with known source identity from this machine",
      );
  const client = await manager.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `derived:${machine}`,
    ]);
    const permitted = await client.query(
      "SELECT id,updated_at FROM users WHERE id=$1 AND is_active=true AND role IN ('admin','supervisor') FOR SHARE",
      [actor],
    );
    if (
      !permitted.rowCount ||
      !userVersion ||
      permitted.rows[0].updated_at?.toISOString() !== userVersion
    )
      throw new ForbiddenError(
        "Reviewer access changed; sign in and review again",
      );
    const latest = (
      await client.query(
        "SELECT coalesce(max(version),0)::int AS version FROM derived_signal_definitions WHERE machine_id=$1 AND name=$2",
        [machine, name],
      )
    ).rows[0].version;
    if (latest !== expectedVersion)
      throw new ConflictError(
        "Definition changed; reload and review the latest version",
      );
    const names = (
      await client.query(
        "SELECT count(DISTINCT name)::int AS count FROM derived_signal_definitions WHERE machine_id=$1",
        [machine],
      )
    ).rows[0].count;
    if (latest === 0 && names >= 100)
      throw new ValidationError("At most 100 calculated signals per machine");
    const saved = (
      await client.query(
        `INSERT INTO derived_signal_definitions(machine_id,name,version,expression,created_by) VALUES($1,$2,$3,$4,$5) RETURNING ${projection}`,
        [machine, name, latest + 1, JSON.stringify(expression), actor],
      )
    ).rows[0];
    await client.query("COMMIT");
    return saved;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function evaluateDerivedSignal(
  machine: number,
  definitionId: number,
  start: Date,
  end: Date,
): Promise<DerivedEvaluation> {
  const span = end.getTime() - start.getTime();
  if (
    !Number.isFinite(span) ||
    span <= 0 ||
    span > 48 * 3600000 ||
    end.getTime() > Date.now() + 5000
  )
    throw new ValidationError("Select a past window of at most 48 hours");
  const definition = (
    await manager.pool.query(
      `SELECT ${projection} FROM derived_signal_definitions WHERE machine_id=$1 AND id=$2`,
      [machine, definitionId],
    )
  ).rows[0] as DerivedSignalDefinition | undefined;
  if (!definition) throw new NotFoundError("Calculated signal");
  const spec: DerivedSpecification = validateDerivedSpecification(
    definition.expression,
  );
  const keys = [
    ...new Set(expressionInputs(spec.expression).map((leaf) => leaf.key)),
  ];
  const fields = `id AS "measurementId", event_id AS "eventId", correction_revision AS "correctionRevision", node_key AS key,timestamp,received_at AS "receivedAt", source_timestamp AS "sourceTimestamp", value,raw_value AS "rawValue",status_code AS "statusCode",reported_status_code AS "reportedStatusCode",source_clock_state AS "sourceClockState",signal_metadata->>'namespaceUri' AS "namespaceUri", signal_metadata->>'identifier' AS identifier`;
  const client = await manager.pool.connect();
  let rows: DerivedObservation[];
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='10s'");
    const previous = (
      await client.query(
        `SELECT DISTINCT ON(node_key) ${fields} FROM opcua_data WHERE machine_id=$1 AND node_key=ANY($2) AND timestamp <= $3 AND timestamp >= $4 ORDER BY node_key,timestamp DESC,id DESC`,
        [
          machine,
          keys,
          start,
          new Date(start.getTime() - spec.maxAgeSeconds * 1000),
        ],
      )
    ).rows;
    const current = (
      await client.query(
        `SELECT ${fields} FROM opcua_data WHERE machine_id=$1 AND node_key=ANY($2) AND timestamp > $3 AND timestamp <= $4 ORDER BY timestamp,id LIMIT 10001`,
        [machine, keys, start, end],
      )
    ).rows;
    if (current.length > 10000)
      throw new ValidationError(
        "More than 10000 source samples; choose a shorter window",
      );
    rows = [...previous, ...current].map((row) => ({
      ...row,
      timestamp: row.timestamp.toISOString(),
      receivedAt: row.receivedAt?.toISOString() ?? null,
      sourceTimestamp: row.sourceTimestamp?.toISOString() ?? null,
    }));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  rows.sort(
    (a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
      a.measurementId - b.measurementId,
  );
  const times = new Set([start.getTime(), end.getTime()]);
  for (const row of rows) {
    const at = Date.parse(row.timestamp),
      expiry = at + spec.maxAgeSeconds * 1000 + 1;
    if (at >= start.getTime()) times.add(at);
    if (expiry >= start.getTime() && expiry <= end.getTime()) times.add(expiry);
  }
  const observations = new Map<string, DerivedObservation>();
  let index = 0;
  const points = [...times]
    .sort((a, b) => a - b)
    .map((time) => {
      while (index < rows.length && Date.parse(rows[index].timestamp) <= time) {
        observations.set(rows[index].key, rows[index]);
        index++;
      }
      return {
        timestamp: new Date(time).toISOString(),
        ...evaluateDerived(spec, observations, new Date(time)),
      };
    });
  return {
    definition,
    definitionDigest: createHash("sha256")
      .update(JSON.stringify(definition.expression))
      .digest("hex"),
    start: start.toISOString(),
    end: end.toISOString(),
    evaluatedAt: new Date().toISOString(),
    points,
    current: points[points.length - 1],
    sampleCount: rows.length,
    truncated: false,
    unitDeclaration:
      "Input units are reviewer declarations; verify them against the physical source. Replay uses current reviewed measurement corrections and preserves raw input evidence.",
  };
}
