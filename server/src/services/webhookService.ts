import crypto from "crypto";
import { eq } from "drizzle-orm";
import db from "../database/db.js";
import { webhooks } from "../database/schema.js";
import type { NewWebhook, WebhookRow } from "../database/schema.js";
import logger from "../utils/logger.js";
import { NotFoundError } from "../utils/errors.js";
import type { WebhookEvent } from "@performance-dashboard/shared";
import { assertSafeOutboundUrl } from "../utils/outboundUrlSafety.js";

function generateSecret(): string {
  return "whsec_" + crypto.randomBytes(24).toString("hex");
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export const webhookService = {
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

    // Fire-and-forget for each webhook
    for (const webhook of matchingWebhooks) {
      deliverWebhook(webhook, event).catch((err) => {
        logger.warn(`Webhook delivery failed for ${webhook.name}: ${err}`);
      });
    }
  },
};

async function deliverWebhook(
  webhook: WebhookRow,
  event: WebhookEvent,
): Promise<{ success: boolean; statusCode: number; message: string }> {
  const safeUrl = await assertSafeOutboundUrl(webhook.url, "Webhook URL");
  const body = JSON.stringify(event);
  const signature = signPayload(body, webhook.secret);

  try {
    const response = await fetch(safeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": event.type,
        "X-Webhook-Id": String(webhook.id),
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
