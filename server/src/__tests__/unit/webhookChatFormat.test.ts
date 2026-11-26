import { expect, it } from "vitest";
import { chatPayload, eventMessage } from "../../services/webhookService.js";

const event = {
  type: "alarm.triggered",
  timestamp: "2026-11-26T10:00:00.000Z",
  payload: {
    source: "Oven temperature",
    severity: "high",
    machineId: 3,
    value: 251,
    threshold: 240,
  },
} as never;

it("posts the alarm as Slack text and as a Teams Adaptive Card", () => {
  const { subject, text } = eventMessage(event);
  expect(subject).toBe(
    "[Performance Dashboard] Alarm: Oven temperature (high)",
  );
  expect(text).toContain("value: 251");
  expect(chatPayload(event, "slack")).toEqual({
    text: `*${subject}*\n${text}`,
  });
  const teams = chatPayload(event, "teams") as {
    type: string;
    attachments: {
      contentType: string;
      content: { type: string; body: { text: string }[] };
    }[];
  };
  expect(teams.type).toBe("message");
  expect(teams.attachments[0].contentType).toBe(
    "application/vnd.microsoft.card.adaptive",
  );
  expect(teams.attachments[0].content.body.map((b) => b.text)).toEqual([
    subject,
    text,
  ]);
});

it("refuses non-alarm events for chat destinations before touching the database", async () => {
  const { webhookService } = await import("../../services/webhookService.js");
  await expect(
    webhookService.createWebhook({
      name: "Teams",
      format: "teams",
      url: "https://example.org/hook",
      events: ["cmms.handoff"],
    }),
  ).rejects.toThrow(/alarm events only/);
});
