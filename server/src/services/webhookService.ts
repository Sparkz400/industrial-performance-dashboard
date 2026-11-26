import crypto from "crypto";
import { notificationResume } from "./maintenanceActions.js";
import { cmmsDestinationDigest } from "./cmmsHandoff.js";
import { reportEmailService } from "./reportEmailService.js";
import {
  eq,
  and,
  isNull,
  isNotNull,
  lte,
  asc,
  sql,
  notLike,
} from "drizzle-orm";
import db from "../database/db.js";
import {
  webhooks,
  webhookDeliveries,
  cmmsHandoffs,
} from "../database/schema.js";
import type { NewWebhook, WebhookRow } from "../database/schema.js";
import logger from "../utils/logger.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import type { WebhookEvent } from "@performance-dashboard/shared";
import { openSecret, sealSecret } from "./machineIdentity.js";
import {
  assertSafeOutboundUrl,
  fetchSafeOutbound,
} from "../utils/outboundUrlSafety.js";

function generateSecret(): string {
  return "whsec_" + crypto.randomBytes(24).toString("hex");
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

const SEALED = "sealed:v1:";
async function signingSecret(webhook: Pick<WebhookRow, "id" | "secret">) {
  if (!webhook.secret.startsWith(SEALED)) return webhook.secret;
  const secret = (
    await openSecret(
      `webhook:${webhook.id}`,
      webhook.secret.slice(SEALED.length),
    )
  ).password;
  if (!secret) throw new Error("Webhook signing secret is missing");
  return secret;
}

// With the 15-minute backoff cap this is about one day of failed attempts.
export const MAX_DELIVERY_ATTEMPTS = 100;

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<void> | undefined;
const DELIVERY_WORKERS = 4;
// A claimed delivery is retried after this long if the sender dies mid-send (at-least-once;
// receivers deduplicate on X-Webhook-Delivery-Id). Longer than the 10 s send timeout.
const CLAIM_MS = 120_000;
let stopped = true;

export const webhookService = {
  /** Upgrade existing destinations before serving requests; preserve the receiver's key. */
  async encryptLegacySecrets(): Promise<void> {
    const rows = await db
      .select({ id: webhooks.id, secret: webhooks.secret })
      .from(webhooks);
    // Verify the original key before any operation that could create a new key file.
    for (const row of rows.filter((row) => row.secret.startsWith(SEALED)))
      await signingSecret(row);
    for (const row of rows.filter((row) => !row.secret.startsWith(SEALED))) {
      const secret =
        SEALED +
        (await sealSecret(`webhook:${row.id}`, { password: row.secret }));
      await db
        .update(webhooks)
        .set({ secret })
        .where(
          and(eq(webhooks.id, row.id), notLike(webhooks.secret, `${SEALED}%`)),
        );
    }
  },
  start(): void {
    if (!stopped) return;
    stopped = false;
    const tick = () => {
      let busy = false;
      // A few deliveries in parallel so one slow receiver cannot hold up an alarm storm.
      pending = Promise.all(
        Array.from({ length: DELIVERY_WORKERS }, () =>
          this.processDeliveries(),
        ),
      )
        .then((worked) => {
          busy = worked.some(Boolean);
        })
        .catch((error) => {
          logger.error(
            "Webhook delivery worker failed; pending events retained",
            error,
          );
        })
        .finally(() => {
          pending = undefined;
          // Keep going while there is work; idle once the queue is empty.
          if (!stopped) timer = setTimeout(tick, busy ? 0 : 1000);
        });
    };
    tick();
  },

  async stop(): Promise<void> {
    stopped = true;
    clearTimeout(timer);
    await pending;
  },

  /** Sends at most one due delivery; returns whether there was one to handle. */
  async processDeliveries(): Promise<boolean> {
    // Claim one delivery in a short transaction (other instances skip it), then send outside
    // it: holding a transaction and a pooled connection through a 10 s HTTP call starved the pool.
    const claimed = await db.transaction(async (tx) => {
      const [delivery] = await tx
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            isNull(webhookDeliveries.deliveredAt),
            isNull(webhookDeliveries.deadLetteredAt),
            lte(webhookDeliveries.nextAttemptAt, new Date()),
          ),
        )
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!delivery) return null;
      const event = delivery.event as {
        type?: string;
        payload?: { id?: number; machineId?: number };
      };
      if (event.type?.startsWith("alarm.") && event.payload?.id) {
        const actions = await tx.execute<{
          suppression_until: Date | null;
          quiet_start: number | null;
          quiet_end: number | null;
        }>(sql`
          SELECT a.suppression_until,a.quiet_start,a.quiet_end FROM maintenance_actions a
          JOIN alert_history original ON original.id=a.alarm_id JOIN alert_history current ON current.id=${event.payload.id}
          WHERE a.completed_at IS NULL AND a.machine_id=current.machine_id AND original.rule_id IS NOT DISTINCT FROM current.rule_id
          AND (original.rule_id IS NOT NULL OR original.id=current.id OR (original.metadata->>'healthKey' IS NOT NULL AND original.metadata->>'healthKey'=current.metadata->>'healthKey'))`);
        const now = new Date();
        const resumes = actions.rows
          .map((a) =>
            notificationResume(
              now,
              a.suppression_until ? new Date(a.suppression_until) : null,
              a.quiet_start,
              a.quiet_end,
            ),
          )
          .filter((d): d is Date => d != null);
        if (resumes.length) {
          await tx
            .update(webhookDeliveries)
            .set({
              nextAttemptAt: new Date(
                Math.max(...resumes.map((d) => d.getTime())),
              ),
            })
            .where(eq(webhookDeliveries.id, delivery.id));
          return "deferred" as const;
        }
      }
      const [destination] = await tx
        .select()
        .from(webhooks)
        .where(eq(webhooks.id, delivery.webhookId));
      let reviewedDestination = true;
      if (event.type === "cmms.handoff") {
        const preserved = await tx.execute<{ destination_digest: string }>(
          sql`SELECT destination_digest FROM cmms_handoffs WHERE delivery_id=${delivery.id}`,
        );
        reviewedDestination =
          !!destination &&
          preserved.rows[0]?.destination_digest ===
            cmmsDestinationDigest(destination);
      }
      await tx
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(Date.now() + CLAIM_MS) })
        .where(eq(webhookDeliveries.id, delivery.id));
      return { delivery, destination, reviewedDestination };
    });
    if (!claimed) return false;
    if (claimed === "deferred") return true;
    const { delivery, destination, reviewedDestination } = claimed;
    const result = !(destination?.isActive && reviewedDestination)
      ? {
          success: false,
          statusCode: 0,
          message: destination?.isActive
            ? "Destination changed after the handoff was reviewed"
            : "Destination is inactive or deleted",
        }
      : destination.kind === "email"
        ? await deliverEmail(
            destination,
            delivery.event as WebhookEvent,
            delivery.id,
          )
        : await deliverWebhook(
            destination,
            {
              id: delivery.id,
              schemaVersion: delivery.schemaVersion,
              ...(delivery.event as WebhookEvent),
            },
            delivery.id,
          );
    const attempts = delivery.attempts + 1;
    await db
      .update(webhookDeliveries)
      .set({
        attempts,
        lastStatus: result.statusCode,
        lastError: result.success ? null : result.message.slice(0, 500),
        deliveredAt: result.success ? new Date() : null,
        deadLetteredAt:
          !result.success && attempts >= MAX_DELIVERY_ATTEMPTS
            ? new Date()
            : null,
        nextAttemptAt: new Date(
          Date.now() + Math.min(900000, 1000 * 2 ** Math.min(attempts, 10)),
        ),
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return true;
  },

  /** Delivered rows are kept 30 days for inspection; dead letters stay until reviewed. */
  async pruneDelivered(): Promise<number> {
    let total = 0;
    for (let round = 0; round < 100; round++) {
      const result = await db.execute(
        sql`DELETE FROM webhook_deliveries WHERE id IN (SELECT id FROM webhook_deliveries WHERE delivered_at < now() - interval '30 days' LIMIT 10000)`,
      );
      total += result.rowCount ?? 0;
      if ((result.rowCount ?? 0) < 10000) break;
    }
    return total;
  },

  async listDeliveries() {
    return db
      .select({
        id: webhookDeliveries.id,
        webhookId: webhookDeliveries.webhookId,
        eventType: sql<string>`${webhookDeliveries.event}->>'type'`,
        schemaVersion: webhookDeliveries.schemaVersion,
        attempts: webhookDeliveries.attempts,
        nextAttemptAt: webhookDeliveries.nextAttemptAt,
        deliveredAt: webhookDeliveries.deliveredAt,
        deadLetteredAt: webhookDeliveries.deadLetteredAt,
        lastStatus: webhookDeliveries.lastStatus,
        lastError: webhookDeliveries.lastError,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .orderBy(
        sql`${webhookDeliveries.deadLetteredAt} IS NULL`,
        sql`${webhookDeliveries.deliveredAt} ASC NULLS FIRST`,
        asc(webhookDeliveries.id),
      )
      .limit(100);
  },

  async getDelivery(id: number) {
    const [delivery] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, id));
    if (!delivery) throw new NotFoundError("Delivery");
    return delivery;
  },

  /** Retry a dead-lettered delivery under its original ID so receivers still deduplicate. */
  async requeueDelivery(id: number) {
    const [requeued] = await db
      .update(webhookDeliveries)
      .set({
        deadLetteredAt: null,
        attempts: 0,
        nextAttemptAt: new Date(),
      })
      .where(
        and(
          eq(webhookDeliveries.id, id),
          isNotNull(webhookDeliveries.deadLetteredAt),
        ),
      )
      .returning({ id: webhookDeliveries.id });
    if (!requeued) {
      await this.getDelivery(id);
      throw new ConflictError("Only dead-lettered deliveries can be requeued");
    }
    return requeued;
  },
  async listWebhooks(): Promise<WebhookRow[]> {
    return Promise.all(
      (await db.select().from(webhooks).orderBy(webhooks.createdAt)).map(
        async (row) => ({
          ...row,
          secret: await signingSecret(row),
        }),
      ),
    );
  },

  async createWebhook(input: {
    name: string;
    kind?: "webhook" | "email";
    url?: string;
    recipients?: string[];
    minSeverity?: string | null;
    machineIds?: number[];
    events: string[];
    createdBy?: number;
  }): Promise<WebhookRow> {
    const email = input.kind === "email";
    const url = email
      ? null
      : (await assertSafeOutboundUrl(input.url!, "Webhook URL")).toString();

    const secret = generateSecret();
    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(webhooks)
        .values({
          name: input.name,
          kind: email ? "email" : "webhook",
          url,
          recipients: email ? (input.recipients ?? []) : [],
          minSeverity: input.minSeverity ?? null,
          machineIds: input.machineIds ?? [],
          events: input.events,
          secret: "pending",
          isActive: true,
          createdBy: input.createdBy ?? null,
        })
        .returning();
      await tx
        .update(webhooks)
        .set({
          secret:
            SEALED +
            (await sealSecret(`webhook:${created.id}`, { password: secret })),
        })
        .where(eq(webhooks.id, created.id));
      return { ...created, secret };
    });
  },

  async updateWebhook(
    id: number,
    input: {
      name?: string;
      url?: string;
      recipients?: string[];
      minSeverity?: string | null;
      machineIds?: number[];
      events?: string[];
      isActive?: boolean;
    },
  ): Promise<WebhookRow> {
    const [existing] = await db
      .select({ kind: webhooks.kind })
      .from(webhooks)
      .where(eq(webhooks.id, id));
    if (!existing) throw new NotFoundError("Webhook");
    if (
      existing.kind === "email"
        ? input.url !== undefined ||
          input.events?.some((e) => !e.startsWith("alarm."))
        : input.recipients !== undefined
    )
      throw new ValidationError(
        "Email destinations take recipients and alarm events; webhooks take a URL",
      );
    const updates: Partial<NewWebhook> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.url !== undefined) {
      const safeUrl = await assertSafeOutboundUrl(input.url, "Webhook URL");
      updates.url = safeUrl.toString();
    }
    if (input.recipients !== undefined) updates.recipients = input.recipients;
    if (input.minSeverity !== undefined)
      updates.minSeverity = input.minSeverity;
    if (input.machineIds !== undefined) updates.machineIds = input.machineIds;
    if (input.events !== undefined) updates.events = input.events;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await db
      .update(webhooks)
      .set(updates)
      .where(eq(webhooks.id, id))
      .returning();
    if (!updated) throw new NotFoundError("Webhook");
    return { ...updated, secret: await signingSecret(updated) };
  },

  async deleteWebhook(id: number): Promise<void> {
    const [preserved] = await db
      .select({ id: cmmsHandoffs.id })
      .from(cmmsHandoffs)
      .where(eq(cmmsHandoffs.webhookId, id))
      .limit(1);
    if (preserved)
      throw new ConflictError(
        "This destination has preserved maintenance handoffs. Deactivate it instead of deleting delivery evidence.",
      );
    const result = await db
      .delete(webhooks)
      .where(eq(webhooks.id, id))
      .returning();
    if (result.length === 0) throw new NotFoundError("Webhook");
  },

  async testWebhook(
    id: number,
  ): Promise<{ success: boolean; statusCode: number; message: string }> {
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, id));
    if (!webhook) throw new NotFoundError("Webhook");

    const testEvent: WebhookEvent = {
      type: "test",
      payload: { message: "This is a test webhook delivery" },
      timestamp: new Date().toISOString(),
    };

    return webhook.kind === "email"
      ? deliverEmail(webhook, testEvent)
      : deliverWebhook(webhook, testEvent);
  },

  async triggerEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const allWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.isActive, true));

    const matchingWebhooks = allWebhooks.filter((w: WebhookRow) => {
      const events = Array.isArray(w.events) ? (w.events as string[]) : [];
      return events.includes(eventType) || events.includes("*");
    });

    const event: WebhookEvent = {
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    };

    for (const webhook of matchingWebhooks) {
      await db
        .insert(webhookDeliveries)
        .values({ webhookId: webhook.id, event });
    }
  },
};

/** Alarm mail through SMTP_*. The delivery ID is the Message-ID, so retries are one message. */
async function deliverEmail(
  destination: WebhookRow,
  event: WebhookEvent,
  deliveryId?: number,
): Promise<{ success: boolean; statusCode: number; message: string }> {
  const payload = event.payload as Record<string, unknown>;
  const subject =
    event.type === "test"
      ? "[Performance Dashboard] Test notification"
      : `[Performance Dashboard] ${event.type === "alarm.cleared" ? "Cleared" : "Alarm"}: ${String(payload.source ?? payload.nodeKey ?? "alarm")} (${String(payload.severity ?? "unknown")})`;
  const text = [
    `Event: ${event.type}`,
    ...[
      "machineId",
      "nodeKey",
      "message",
      "value",
      "threshold",
      "conditionState",
      "triggeredAt",
      "clearedAt",
    ]
      .filter((key) => payload[key] != null)
      .map((key) => `${key}: ${String(payload[key])}`),
    `Recorded: ${event.timestamp}`,
    "This message reports recorded data; check the machine before acting.",
  ].join("\n");
  try {
    const rejected = await reportEmailService.sendText(
      destination.recipients,
      subject,
      text,
      `<delivery-${deliveryId ?? `test-${Date.now()}`}@performance-dashboard>`,
    );
    return rejected.length
      ? {
          success: false,
          statusCode: 0,
          message: `Rejected recipients: ${rejected.join(", ")}`,
        }
      : {
          success: true,
          statusCode: 250,
          message: "Accepted by the mail server",
        };
  } catch (error) {
    const code = String((error as { code?: unknown }).code);
    return {
      success: false,
      statusCode: 0,
      message: ["EDNS", "ECONNECTION", "ETIMEDOUT", "ESOCKET"].includes(code)
        ? "Mail server unreachable; check the network and SMTP_HOST, then retry"
        : error instanceof Error && error.message === "SMTP is not configured"
          ? "SMTP is not configured"
          : "SMTP delivery failed; check the mail server and retry",
    };
  }
}

async function deliverWebhook(
  webhook: WebhookRow,
  event: WebhookEvent,
  deliveryId?: number,
): Promise<{ success: boolean; statusCode: number; message: string }> {
  const body = JSON.stringify(event);
  try {
    const signature = signPayload(body, await signingSecret(webhook));
    const safeUrl = await assertSafeOutboundUrl(
      webhook.url ?? "",
      "Webhook URL",
    );
    const response = await fetchSafeOutbound(safeUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": event.type,
        "X-Webhook-Id": String(webhook.id),
        "X-Webhook-Schema-Version": String(event.schemaVersion ?? 1),
        ...(deliveryId ? { "X-Webhook-Delivery-Id": String(deliveryId) } : {}),
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    // Update last triggered status

    await db
      .update(webhooks)
      .set({
        lastTriggeredAt: new Date(),
        lastStatus: response.status,
      })
      .where(eq(webhooks.id, webhook.id));

    return {
      success: response.ok,
      statusCode: response.status,
      message: response.ok
        ? "Delivered successfully"
        : `HTTP ${response.status}`,
    };
  } catch (error) {
    await db
      .update(webhooks)
      .set({
        lastTriggeredAt: new Date(),
        lastStatus: 0,
      })
      .where(eq(webhooks.id, webhook.id));

    return {
      success: false,
      statusCode: 0,
      message: error instanceof Error ? error.message : "Delivery failed",
    };
  }
}
