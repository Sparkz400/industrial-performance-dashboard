import nodemailer from "nodemailer";
import twilio from "twilio";
import { alertRepository } from "../repositories/alertRepository.js";
import type { AlertHistoryRow } from "../database/schema.js";
import logger from "../utils/logger.js";

// ---- Notifier Functions ----

async function sendEmail(
  config: Record<string, any>,
  alert: AlertHistoryRow,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.smtp?.host,
    port: config.smtp?.port ?? 587,
    secure: config.smtp?.secure ?? false,
    auth: config.smtp?.auth
      ? { user: config.smtp.auth.user, pass: config.smtp.auth.pass }
      : undefined,
  });

  await transporter.sendMail({
    from: config.from ?? "alerts@performancedashboard.local",
    to: config.to,
    subject: `[${alert.severity?.toUpperCase()}] Alert: ${alert.ruleName}`,
    text: [
      `Alert: ${alert.ruleName}`,
      `Severity: ${alert.severity}`,
      `Message: ${alert.message}`,
      `Value: ${alert.triggerValue}`,
      `Threshold: ${alert.threshold}`,
      `Node: ${alert.nodeKey}`,
      `Time: ${alert.createdAt?.toISOString() ?? new Date().toISOString()}`,
    ].join("\n"),
  });
}

async function sendSlack(
  config: Record<string, any>,
  alert: AlertHistoryRow,
): Promise<void> {
  const payload = {
    text: `*[${alert.severity?.toUpperCase()}] ${alert.ruleName}*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*Alert:* ${alert.ruleName}`,
            `*Severity:* ${alert.severity}`,
            `*Message:* ${alert.message}`,
            `*Value:* ${alert.triggerValue} (threshold: ${alert.threshold})`,
            `*Node:* ${alert.nodeKey}`,
            `*Time:* ${alert.createdAt?.toISOString() ?? new Date().toISOString()}`,
          ].join("\n"),
        },
      },
    ],
  };

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Slack webhook returned ${response.status}: ${await response.text()}`,
    );
  }
}

async function sendTeams(
  config: Record<string, any>,
  alert: AlertHistoryRow,
): Promise<void> {
  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              text: `[${alert.severity?.toUpperCase()}] ${alert.ruleName}`,
            },
            {
              type: "FactSet",
              facts: [
                { title: "Severity", value: alert.severity ?? "unknown" },
                { title: "Message", value: alert.message ?? "" },
                { title: "Value", value: String(alert.triggerValue) },
                { title: "Threshold", value: String(alert.threshold) },
                { title: "Node", value: alert.nodeKey ?? "" },
                {
                  title: "Time",
                  value:
                    alert.createdAt?.toISOString() ?? new Date().toISOString(),
                },
              ],
            },
          ],
        },
      },
    ],
  };

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });

  if (!response.ok) {
    throw new Error(
      `Teams webhook returned ${response.status}: ${await response.text()}`,
    );
  }
}

async function sendSms(
  config: Record<string, any>,
  alert: AlertHistoryRow,
): Promise<void> {
  const client = twilio(config.accountSid, config.authToken);

  await client.messages.create({
    body: `[${alert.severity?.toUpperCase()}] ${alert.ruleName}: ${alert.message}`,
    from: config.from,
    to: config.to,
  });
}

function sendInApp(
  _config: Record<string, any>,
  _alert: AlertHistoryRow,
): void {
  // In-app notifications are handled via socket broadcasts; no-op here.
}

// ---- Dispatcher ----

const NOTIFIERS: Record<
  string,
  (config: Record<string, any>, alert: AlertHistoryRow) => Promise<void> | void
> = {
  email: sendEmail,
  slack: sendSlack,
  teams: sendTeams,
  sms: sendSms,
  in_app: sendInApp,
};

export async function dispatch(
  alert: AlertHistoryRow,
  channelIds: number[],
): Promise<void> {
  for (const channelId of channelIds) {
    try {
      const channel = await alertRepository.findChannelById(channelId);
      if (!channel || !channel.isActive) continue;

      const notifier = NOTIFIERS[channel.type];
      if (!notifier) {
        logger.warn(
          `[NotificationDispatcher] Unknown channel type "${channel.type}" for channel ${channel.id}`,
        );
        continue;
      }

      await notifier(channel.config as Record<string, any>, alert);

      logger.info(
        `[NotificationDispatcher] Sent ${channel.type} notification via channel "${channel.name}" for alert ${alert.id}`,
      );
    } catch (err) {
      logger.error(
        `[NotificationDispatcher] Failed to dispatch to channel ${channelId}:`,
        err,
      );
    }
  }
}
