import nodemailer, { type Transporter } from "nodemailer";
import path from "path";
import logger from "../utils/logger.js";
import config from "../config/config.js";

// ---------------------------------------------------------------------------
// Email Service for Scheduled Reports
// ---------------------------------------------------------------------------

class ReportEmailService {
  private transporter: Transporter | null = null;
  get configured(): boolean {
    return Boolean(config.SMTP_HOST);
  }

  /**
   * Lazily create the nodemailer transport from environment configuration.
   * Returns null if SMTP is not configured.
   */
  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const host = config.SMTP_HOST;
    const port = config.SMTP_PORT;
    const user = config.SMTP_USER;
    const pass = config.SMTP_PASS;

    if (!host) {
      logger.warn(
        "[ReportEmail] SMTP_HOST is not configured — email delivery is disabled",
      );
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: port ? Number(port) : 587,
      secure: port === "465" || port === 465,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    return this.transporter;
  }

  /**
   * Send a report PDF to the given recipients.
   */
  async sendReport(
    recipients: string[],
    subject: string,
    body: string,
    pdfPath: string,
    messageId: string,
  ): Promise<string[]> {
    const transport = this.getTransporter();
    if (!transport) {
      throw new Error("SMTP is not configured");
    }

    if (recipients.length === 0) {
      logger.debug("[ReportEmail] No recipients — skipping email");
      return [];
    }

    const from =
      config.SMTP_FROM ??
      config.SMTP_USER ??
      "noreply@performancedashboard.local";

    const filename = path.basename(pdfPath);

    try {
      const info = await transport.sendMail({
        from,
        to: recipients.join(", "),
        subject,
        text: body,
        messageId,
        attachments: [
          {
            filename,
            path: pdfPath,
            contentType: "application/pdf",
          },
        ],
      });

      logger.info(`[ReportEmail] SMTP result recorded for ${messageId}`);
      const accepted = new Set(
        (info.accepted ?? []).map((entry: string | { address: string }) =>
          typeof entry === "string"
            ? entry.toLowerCase()
            : entry.address.toLowerCase(),
        ),
      );
      return recipients.filter(
        (recipient) => !accepted.has(recipient.toLowerCase()),
      );
    } catch (err) {
      logger.error("[ReportEmail] Failed to send email:", err);
      throw err;
    }
  }
}

export const reportEmailService = new ReportEmailService();
