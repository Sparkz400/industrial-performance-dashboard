import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import manager from "../database/dbConnection.js";
import config from "../config/config.js";
import { canonicalJson } from "../utils/canonicalJson.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";

const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export const cmmsDestinationDigest = (destination: {
  id: number;
  name: string;
  url: string;
  events: unknown;
  isActive?: boolean;
  is_active?: boolean;
}) =>
  digest({
    id: destination.id,
    name: destination.name,
    url: destination.url,
    events: destination.events,
    active: destination.isActive ?? destination.is_active,
  });

export interface CmmsReview {
  machineId: number;
  actorId: number;
  actionId: number;
  webhookId: number;
  actionVersion: number;
  source: string;
  contentDigest: string;
  destinationDigest: string;
  expiresAt: string;
}
const sign = (review: CmmsReview) =>
  createHmac("sha256", config.SESSION_SECRET)
    .update(canonicalJson(review))
    .digest("hex");
export function verifyCmmsReview(
  review: CmmsReview,
  signature: string,
  actorId: number,
  machineId: number,
) {
  const expected = sign(review);
  if (
    review.actorId !== actorId ||
    review.machineId !== machineId ||
    Date.parse(review.expiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(review.expiresAt)) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new ConflictError(
      "Review expired or changed; preview the handoff again",
    );
}

async function source(
  machineId: number,
  actionId: number,
  webhookId: number,
  sourceId: string,
  connection: Pick<PoolClient, "query"> = manager.pool,
) {
  const action = (
    await connection.query(
      `SELECT a.*,m.name AS machine_name,h.rule_name,h.message AS alarm_message FROM maintenance_actions a
     JOIN machines m ON m.id=a.machine_id JOIN alert_history h ON h.id=a.alarm_id WHERE a.id=$1 AND a.machine_id=$2`,
      [actionId, machineId],
    )
  ).rows[0];
  if (!action) throw new NotFoundError("Maintenance action");
  const destination =
    webhookId === 0
      ? { id: 0, name: "File export", url: "", events: [], is_active: false }
      : (
          await connection.query(
            "SELECT * FROM webhooks WHERE id=$1 AND is_active AND events ? 'cmms.handoff'",
            [webhookId],
          )
        ).rows[0];
  if (!destination)
    throw new ConflictError(
      "Choose an active destination explicitly configured for cmms.handoff",
    );
  const payload = {
    version: "cmms-handoff-v1",
    source: sourceId,
    machineId,
    externalId: `maintenance-action:${action.id}`,
    asset: { id: `machine:${machineId}`, name: action.machine_name },
    action: {
      id: action.id,
      version: action.version,
      description: action.action,
      dueAt: new Date(action.due_at).toISOString(),
      completedAt: action.completed_at
        ? new Date(action.completed_at).toISOString()
        : null,
    },
    incident: {
      id: action.alarm_id,
      name: action.rule_name,
      message: action.alarm_message,
    },
  };
  return { action, destination, payload };
}

export async function previewCmms(
  machineId: number,
  actorId: number,
  actionId: number,
  webhookId: number,
  sourceId: string,
) {
  const { action, destination, payload } = await source(
    machineId,
    actionId,
    webhookId,
    sourceId,
  );
  const review: CmmsReview = {
    machineId,
    actorId,
    actionId,
    webhookId,
    source: sourceId,
    actionVersion: action.version,
    contentDigest: digest(payload),
    destinationDigest: cmmsDestinationDigest(destination),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  return {
    review,
    signature: sign(review),
    payload,
    destination: {
      id: destination.id,
      name: destination.name,
      origin: destination.url ? new URL(destination.url).origin : null,
    },
    deliveryContract:
      "Use a unique, stable installation source. Receiver must deduplicate source + externalId and payload.handoffId on retries. A successful HTTP response confirms transport acceptance, not creation of a remote work order.",
  };
}

export async function submitCmms(
  machineId: number,
  actorId: number,
  sessionVersion: string,
  review: CmmsReview,
  signature: string,
) {
  verifyCmmsReview(review, signature, actorId, machineId);
  const connection = await manager.pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `cmms:${review.actionId}:${review.webhookId}`,
    ]);
    verifyCmmsReview(review, signature, actorId, machineId);
    const actor = (
      await connection.query(
        "SELECT updated_at FROM users WHERE id=$1 AND is_active AND role IN ('admin','supervisor') FOR SHARE",
        [actorId],
      )
    ).rows[0];
    if (!actor || new Date(actor.updated_at).toISOString() !== sessionVersion)
      throw new ForbiddenError(
        "Your account or asset permissions changed; sign in again before submitting a handoff",
      );
    const existing = (
      await connection.query(
        "SELECT * FROM cmms_handoffs WHERE action_id=$1 AND webhook_id=$2",
        [review.actionId, review.webhookId],
      )
    ).rows[0];
    if (existing) {
      const { handoffId: _id, ...content } = existing.payload;
      if (
        existing.machine_id !== machineId ||
        existing.action_version !== review.actionVersion ||
        existing.destination_digest !== review.destinationDigest ||
        digest(content) !== review.contentDigest
      )
        throw new ConflictError(
          "This action already has a preserved handoff; inspect its delivery instead of creating another order",
        );
      await connection.query("COMMIT");
      return { created: false, handoff: existing };
    }
    await connection.query(
      "SELECT id FROM maintenance_actions WHERE id=$1 FOR UPDATE",
      [review.actionId],
    );
    await connection.query("SELECT id FROM webhooks WHERE id=$1 FOR SHARE", [
      review.webhookId,
    ]);
    const { action, destination, payload } = await source(
      machineId,
      review.actionId,
      review.webhookId,
      review.source,
      connection,
    );
    if (
      action.version !== review.actionVersion ||
      digest(payload) !== review.contentDigest ||
      cmmsDestinationDigest(destination) !== review.destinationDigest
    )
      throw new ConflictError(
        "Action or destination changed; preview again before sending",
      );
    const handoffId = randomUUID(),
      preserved = { ...payload, handoffId },
      event = {
        type: "cmms.handoff",
        timestamp: new Date().toISOString(),
        payload: preserved,
      };
    const delivery = (
      await connection.query(
        "INSERT INTO webhook_deliveries(webhook_id,event) VALUES($1,$2) RETURNING id",
        [review.webhookId, event],
      )
    ).rows[0];
    const handoff = (
      await connection.query(
        `INSERT INTO cmms_handoffs(id,machine_id,action_id,action_version,webhook_id,delivery_id,payload,destination_digest,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          handoffId,
          machineId,
          review.actionId,
          action.version,
          review.webhookId,
          delivery.id,
          preserved,
          review.destinationDigest,
          actorId,
        ],
      )
    ).rows[0];
    await connection.query("COMMIT");
    return { created: true, handoff };
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCmms(machineId: number) {
  return (
    await manager.pool.query(
      `SELECT h.*,w.name AS destination_name,d.attempts,d.last_status,d.delivered_at,d.next_attempt_at,w.url,w.events,w.is_active
     FROM cmms_handoffs h JOIN webhooks w ON w.id=h.webhook_id JOIN webhook_deliveries d ON d.id=h.delivery_id
     WHERE h.machine_id=$1 ORDER BY h.created_at DESC LIMIT 101`,
      [machineId],
    )
  ).rows.map(({ url, events, is_active, ...row }) => ({
    ...row,
    blocked:
      row.delivered_at == null &&
      cmmsDestinationDigest({
        id: row.webhook_id,
        name: row.destination_name,
        url,
        events,
        is_active,
      }) !== row.destination_digest,
  }));
}
