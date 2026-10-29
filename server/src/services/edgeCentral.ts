import { createHash, randomBytes } from "node:crypto";
import Joi from "joi";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  edgeConfigRevisions,
  edgeMachines,
  edgeNodes,
  machineSites,
  machines,
  opcuaData,
} from "../database/schema.js";
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "../utils/errors.js";

// H08/E04 central side: enrolled edges push committed measurements; nothing is pushed back
// except sync settings, never machine commands.
export const EDGE_SCHEMA_VERSIONS = [1];
export const EDGE_TOKEN_PREFIX = "pded_";
const ENROLLMENT_PREFIX = "pdee_";
const ENROLLMENT_HOURS = 24;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = (prefix: string) =>
  prefix + randomBytes(32).toString("base64url");

/** A new one-time enrollment code; enrolling with it replaces any earlier token (rotation). */
export async function issueEnrollment(edgeId: number) {
  const code = secret(ENROLLMENT_PREFIX);
  const expiresAt = new Date(Date.now() + ENROLLMENT_HOURS * 3600_000);
  await db
    .update(edgeNodes)
    .set({ enrollmentHash: digest(code), enrollmentExpiresAt: expiresAt })
    .where(eq(edgeNodes.id, edgeId));
  return { code, expiresAt };
}

export async function enroll(code: unknown) {
  if (typeof code !== "string" || !code.startsWith(ENROLLMENT_PREFIX))
    throw new UnauthorizedError("Enrollment code unknown or expired");
  const token = secret(EDGE_TOKEN_PREFIX);
  const [edge] = await db
    .update(edgeNodes)
    .set({
      tokenHash: digest(token),
      enrolledAt: new Date(),
      enrollmentHash: null,
      enrollmentExpiresAt: null,
    })
    .where(
      and(
        eq(edgeNodes.enrollmentHash, digest(code)),
        gt(edgeNodes.enrollmentExpiresAt, new Date()),
        isNull(edgeNodes.revokedAt),
      ),
    )
    .returning({ id: edgeNodes.id, name: edgeNodes.name });
  if (!edge) throw new UnauthorizedError("Enrollment code unknown or expired");
  return { token, edge };
}

export async function authenticateEdge(header: string | undefined) {
  const match = /^Bearer (pded_[A-Za-z0-9_-]{43})$/.exec(header ?? "");
  if (!match) return null;
  const [edge] = await db
    .update(edgeNodes)
    .set({ lastContactAt: new Date() })
    .where(
      and(
        eq(edgeNodes.tokenHash, digest(match[1])),
        isNull(edgeNodes.revokedAt),
      ),
    )
    .returning();
  return edge ?? null;
}

const positive = Joi.number().integer().positive();
const instant = Joi.date().iso();
export const batchSchema = Joi.object({
  schemaVersion: Joi.number().integer().required(),
  softwareVersion: Joi.string().max(40).required(),
  backlog: Joi.number().integer().min(0).required(),
  cursor: Joi.number().integer().min(0).required(),
  appliedConfigRevision: Joi.number().integer().min(0).required(),
  configRejection: Joi.string().max(500).allow(null).default(null),
  machines: Joi.array()
    .max(500)
    .unique("id")
    .items(
      Joi.object({
        id: positive.required(),
        name: Joi.string().max(255).required(),
        definitionDigest: Joi.string()
          .hex()
          .length(64)
          .allow(null)
          .default(null),
      }),
    )
    .required(),
  rows: Joi.array()
    .max(5000)
    .items(
      Joi.object({
        id: positive.required(),
        machineId: positive.required(),
        nodeKey: Joi.string().max(255).required(),
        nodeLabel: Joi.string().max(255).allow(null).default(null),
        timestamp: instant.required(),
        value: Joi.number().allow(null).default(null),
        rawValue: Joi.alternatives(
          Joi.number(),
          Joi.string().max(4096),
          Joi.boolean(),
        )
          .allow(null)
          .default(null),
        statusCode: Joi.string().max(64).allow(null).default(null),
        reportedStatusCode: Joi.string().max(64).allow(null).default(null),
        sourceClockState: Joi.string().max(20).required(),
        correctionRevision: Joi.number().integer().min(0).default(0),
        dataType: Joi.string().max(40).allow(null).default(null),
        sourceTimestamp: instant.allow(null).default(null),
        receivedAt: instant.allow(null).default(null),
        signalMetadata: Joi.object().unknown(true).allow(null).default(null),
        eventId: Joi.string().max(80).allow(null).default(null),
      }),
    )
    .required(),
});
export type EdgeBatch = {
  schemaVersion: number;
  softwareVersion: string;
  backlog: number;
  cursor: number;
  appliedConfigRevision: number;
  configRejection: string | null;
  machines: { id: number; name: string; definitionDigest: string | null }[];
  rows: (Omit<typeof opcuaData.$inferInsert, "id" | "machineId" | "eventId"> & {
    id: number;
    machineId: number;
    eventId: string | null;
  })[];
};

/**
 * Stores one batch in a single transaction and returns the cursor to acknowledge. Rows keep
 * their source identity as `edge<id>:<event>`, so a replayed batch stores nothing twice.
 */
export async function ingestBatch(
  edge: typeof edgeNodes.$inferSelect,
  batch: EdgeBatch,
) {
  if (!EDGE_SCHEMA_VERSIONS.includes(batch.schemaVersion))
    throw new ConflictError(
      `Schema version ${batch.schemaVersion} is not accepted; this installation accepts ${EDGE_SCHEMA_VERSIONS.join(", ")}`,
    );
  const declared = new Set(batch.machines.map((m) => m.id));
  if (batch.rows.some((row) => !declared.has(row.machineId)))
    throw new ValidationError(
      "Every row's machine must be declared in the batch",
    );
  if (batch.rows.some((row) => row.id > batch.cursor))
    throw new ValidationError("A row lies beyond the batch cursor");
  return db.transaction(async (tx) => {
    // One batch per edge at a time.
    const [current] = await tx
      .select()
      .from(edgeNodes)
      .where(eq(edgeNodes.id, edge.id))
      .for("update");
    if (current.revokedAt) throw new UnauthorizedError("Edge revoked");
    const local = new Map<number, number>();
    for (const machine of batch.machines) {
      const [known] = await tx
        .update(edgeMachines)
        .set({
          remoteName: machine.name,
          definitionDigest: machine.definitionDigest,
        })
        .where(
          and(
            eq(edgeMachines.edgeId, edge.id),
            eq(edgeMachines.remoteMachineId, machine.id),
          ),
        )
        .returning({ machineId: edgeMachines.machineId });
      if (known) {
        local.set(machine.id, known.machineId);
        continue;
      }
      // Site-qualified: equal machine ids or addresses on two edges never collide.
      const [created] = await tx
        .insert(machines)
        .values({
          name: `${current.name} · ${machine.name}`.slice(0, 255),
          endpointUrl: `edge://${edge.id}/${machine.id}`,
          ip: "edge",
          isActive: false,
        })
        .returning({ id: machines.id });
      await tx
        .insert(machineSites)
        .values({ machineId: created.id, plantId: current.plantId });
      await tx.insert(edgeMachines).values({
        edgeId: edge.id,
        remoteMachineId: machine.id,
        machineId: created.id,
        remoteName: machine.name,
        definitionDigest: machine.definitionDigest,
      });
      local.set(machine.id, created.id);
    }
    let stored = 0;
    for (let i = 0; i < batch.rows.length; i += 1000) {
      const chunk = batch.rows.slice(i, i + 1000);
      const inserted = await tx
        .insert(opcuaData)
        .values(
          chunk.map(({ id, machineId, eventId, ...row }) => ({
            ...row,
            timestamp: new Date(row.timestamp),
            sourceTimestamp: row.sourceTimestamp
              ? new Date(row.sourceTimestamp)
              : null,
            receivedAt: row.receivedAt ? new Date(row.receivedAt) : null,
            machineId: local.get(machineId)!,
            eventId: `edge${edge.id}:${eventId ?? `row${id}`}`,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: opcuaData.id });
      stored += inserted.length;
    }
    const newest = batch.rows.reduce<Date | null>((max, row) => {
      const at = new Date(row.timestamp);
      return !max || at > max ? at : max;
    }, null);
    await tx
      .update(edgeNodes)
      .set({
        lastBatchAt: new Date(),
        acknowledgedCursor: batch.cursor,
        backlog: batch.backlog,
        softwareVersion: batch.softwareVersion,
        schemaVersion: batch.schemaVersion,
        appliedConfigRevision: batch.appliedConfigRevision,
        configRejection: batch.configRejection,
        ...(newest
          ? {
              newestReadingAt: sql`GREATEST(${edgeNodes.newestReadingAt}, ${newest})`,
            }
          : {}),
      })
      .where(eq(edgeNodes.id, edge.id));
    const [config] = await tx
      .select()
      .from(edgeConfigRevisions)
      .where(eq(edgeConfigRevisions.edgeId, edge.id))
      .orderBy(desc(edgeConfigRevisions.revision))
      .limit(1);
    return {
      acknowledged: batch.cursor,
      stored,
      duplicates: batch.rows.length - stored,
      config:
        config && config.revision > batch.appliedConfigRevision
          ? {
              revision: config.revision,
              schemaVersion: config.schemaVersion,
              settings: config.settings,
            }
          : null,
      targetVersion: current.targetVersion,
    };
  });
}
