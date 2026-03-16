import nodemailer from "nodemailer";
import path from "path";
import logger from "../utils/logger.js";
import config from "../config/config.js";

// ---------------------------------------------------------------------------
// Email Service for Scheduled Reports
// ---------------------------------------------------------------------------

class ReportEmailService {
  private transporter: nodemailer.Transporter | null = null;

  /**
   * Lazily create the nodemailer transport from environment configuration.
   * Returns null if SMTP is not configured.
   */
  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;

    const host = (config as any).SMTP_HOST;
    const port = (config as any).SMTP_PORT;
    const user = (config as any).SMTP_USER;
    const pass = (config as any).SMTP_PASS;

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
  ): Promise<void> {
    const transport = this.getTransporter();
    if (!transport) {
      logger.info(
        "[ReportEmail] Skipping email — SMTP transport not available",
      );
      return;
    }

    if (recipients.length === 0) {
      logger.debug("[ReportEmail] No recipients — skipping email");
      return;
    }

    const from =
      (config as any).SMTP_FROM ??
      (config as any).SMTP_USER ??
      "noreply@performancedashboard.local";

    const filename = path.basename(pdfPath);

    try {
      const info = await transport.sendMail({
        from,
        to: recipients.join(", "),
        subject,
        text: body,
        attachments: [
          {
            filename,
            path: pdfPath,
            contentType: "application/pdf",
          },
        ],
      });

      logger.info(
        `[ReportEmail] Email sent to ${recipients.join(", ")} — messageId: ${info.messageId}`,
      );
    } catch (err) {
      logger.error("[ReportEmail] Failed to send email:", err);
      throw err;
    }
  }
}

export const reportEmailService = new ReportEmailService();
