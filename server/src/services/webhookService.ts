import crypto from "crypto";
import { notificationResume } from "./maintenanceActions.js";
import { cmmsDestinationDigest } from "./cmmsHandoff.js";
import { eq, and, isNull, lte, asc, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  webhooks,
  webhookDeliveries,
  cmmsHandoffs,
} from "../database/schema.js";
import type { NewWebhook, WebhookRow } from "../database/schema.js";
import logger from "../utils/logger.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import type { WebhookEvent } from "@performance-dashboard/shared";
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

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<void> | undefined;
let stopped = true;

export const webhookService = {
  start(): void {
    if (!stopped) return;
    stopped = false;
    const tick = () => {
      pending = this.processDeliveries()
        .catch((error) => {
          logger.error(
            "Webhook delivery worker failed; pending events retained",
            error,
          );
        })
        .finally(() => {
          pending = undefined;
          if (!stopped) timer = setTimeout(tick, 1000);
        });
    };
    tick();
  },

  async stop(): Promise<void> {
    stopped = true;
    clearTimeout(timer);
    await pending;
  },

  async processDeliveries(): Promise<void> {
    // Lock one delivery at a time; multiple application instances cannot send it concurrently.
    await db.transaction(async (tx) => {
      const [delivery] = await tx
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            isNull(webhookDeliveries.deliveredAt),
            lte(webhookDeliveries.nextAttemptAt, new Date()),
          ),
        )
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!delivery) return;
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
          return;
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
      const result =
        destination?.isActive && reviewedDestination
          ? await deliverWebhook(
              destination,
              delivery.event as WebhookEvent,
              delivery.id,
            )
          : { success: false, statusCode: 0 };
      const attempts = delivery.attempts + 1;
      await tx
        .update(webhookDeliveries)
        .set({
          attempts,
          lastStatus: result.statusCode,
          deliveredAt: result.success ? new Date() : null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(900000, 1000 * 2 ** Math.min(attempts, 10)),
          ),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    });
  },

  async listDeliveries() {
    return db
      .select({
        id: webhookDeliveries.id,
        webhookId: webhookDeliveries.webhookId,
        attempts: webhookDeliveries.attempts,
        nextAttemptAt: webhookDeliveries.nextAttemptAt,
        deliveredAt: webhookDeliveries.deliveredAt,
        lastStatus: webhookDeliveries.lastStatus,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .orderBy(
        sql`${webhookDeliveries.deliveredAt} ASC NULLS FIRST`,
        asc(webhookDeliveries.id),
      )
      .limit(100);
  },
  async listWebhooks(): Promise<WebhookRow[]> {
    return db.select().from(webhooks).orderBy(webhooks.createdAt);
  },

  async createWebhook(input: {
    name: string;
    url: string;
    events: string[];
    createdBy?: number;
  }): Promise<WebhookRow> {
    const safeUrl = await assertSafeOutboundUrl(input.url, "Webhook URL");

    const secret = generateSecret();
    const [created] = await db
      .insert(webhooks)
      .values({
        name: input.name,
        url: safeUrl.toString(),
        events: input.events,
        secret,
        isActive: true,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return created;
  },

  async updateWebhook(
    id: number,
    input: {
      name?: string;
      url?: string;
      events?: string[];
      isActive?: boolean;
    },
  ): Promise<WebhookRow> {
    const updates: Partial<NewWebhook> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.url !== undefined) {
      const safeUrl = await assertSafeOutboundUrl(input.url, "Webhook URL");
      updates.url = safeUrl.toString();
    }
    if (input.events !== undefined) updates.events = input.events;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await db
      .update(webhooks)
      .set(updates)
      .where(eq(webhooks.id, id))
      .returning();
    if (!updated) throw new NotFoundError("Webhook");
    return updated;
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

    return deliverWebhook(webhook, testEvent);
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

async function deliverWebhook(
  webhook: WebhookRow,
  event: WebhookEvent,
  deliveryId?: number,
): Promise<{ success: boolean; statusCode: number; message: string }> {
  const body = JSON.stringify(event);
  const signature = signPayload(body, webhook.secret);

  try {
    const safeUrl = await assertSafeOutboundUrl(webhook.url, "Webhook URL");
    const response = await fetchSafeOutbound(safeUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": event.type,
        "X-Webhook-Id": String(webhook.id),
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
