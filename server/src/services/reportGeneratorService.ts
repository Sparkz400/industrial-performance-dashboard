import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { reportRepository } from "../repositories/reportRepository.js";
import { trendingDataService } from "./trendingDataService.js";
import { reportEmailService } from "./reportEmailService.js";
import logger from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORTS_DIR = path.resolve("server/reports");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureReportsDir(): void {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function formatDate(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-");
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

interface SectionConfig {
  type: string;
  title?: string;
  nodeKeys?: string[];
  machineId?: number;
  [key: string]: unknown;
}

interface TemplateConfig {
  title?: string;
  sections?: SectionConfig[];
  [key: string]: unknown;
}

function renderHtmlReport(
  title: string,
  sections: string[],
  generatedAt: Date,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a237e; border-bottom: 2px solid #1a237e; padding-bottom: 8px; }
    h2 { color: #283593; margin-top: 32px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
    th { background: #e8eaf6; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; }
    .summary-box { background: #f5f5f5; border-radius: 6px; padding: 16px; margin: 12px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${sections.join("\n")}
  <div class="footer">Generated at ${generatedAt.toISOString()}</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTrendingSection(
  title: string,
  series: {
    nodeKey: string;
    displayName: string;
    data: { timestamp: string; value: number | null }[];
  }[],
): string {
  if (series.length === 0) {
    return `<h2>${escapeHtml(title)}</h2><p>No data available.</p>`;
  }

  const rows: string[] = [];
  for (const s of series) {
    if (s.data.length === 0) continue;
    const latest = s.data[s.data.length - 1];
    const values = s.data
      .map((d) => d.value)
      .filter((v) => v != null) as number[];
    const avg =
      values.length > 0
        ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
        : "N/A";
    const min = values.length > 0 ? Math.min(...values).toFixed(2) : "N/A";
    const max = values.length > 0 ? Math.max(...values).toFixed(2) : "N/A";

    rows.push(
      `<tr>
        <td>${escapeHtml(s.displayName)}</td>
        <td>${latest.value != null ? latest.value.toFixed(2) : "N/A"}</td>
        <td>${avg}</td>
        <td>${min}</td>
        <td>${max}</td>
        <td>${s.data.length}</td>
      </tr>`,
    );
  }

  return `<h2>${escapeHtml(title)}</h2>
<table>
  <thead><tr><th>Tag</th><th>Latest</th><th>Avg</th><th>Min</th><th>Max</th><th>Points</th></tr></thead>
  <tbody>${rows.join("")}</tbody>
</table>`;
}

function renderAlertSection(title: string): string {
  // Placeholder — real implementation would query alertHistory
  return `<h2>${escapeHtml(title)}</h2>
<div class="summary-box"><p>Alert summary data will appear here when alert history is available.</p></div>`;
}

function renderOeeSection(title: string): string {
  // Placeholder — real implementation would call oeeCalculationService
  return `<h2>${escapeHtml(title)}</h2>
<div class="summary-box"><p>OEE summary data will appear here when OEE data is available.</p></div>`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ReportGeneratorService {
  /**
   * Generate a PDF report for a given schedule.
   */
  async generate(scheduleId: number): Promise<void> {
    ensureReportsDir();

    // Load schedule & template
    const schedule = await reportRepository.findScheduleById(scheduleId);
    if (!schedule) {
      logger.error(
        `[ReportGenerator] Schedule ${scheduleId} not found — skipping`,
      );
      return;
    }

    const template = await reportRepository.findTemplateById(
      schedule.templateId,
    );
    if (!template) {
      logger.error(
        `[ReportGenerator] Template ${schedule.templateId} not found for schedule ${scheduleId}`,
      );
      return;
    }

    // Create history entry with 'generating' status
    const historyEntry = await reportRepository.createHistory({
      scheduleId: schedule.id,
      templateId: template.id,
      scheduleName: schedule.name,
      status: "generating",
    });

    try {
      const templateConfig = (template.templateConfig ?? {}) as TemplateConfig;
      const reportTitle = templateConfig.title ?? template.name ?? "Report";
      const sections: string[] = [];
      const now = new Date();
      const endDate = now;
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default: last 24h

      // Build sections based on template config
      const configSections = templateConfig.sections ?? [];

      for (const section of configSections) {
        switch (section.type) {
          case "trending": {
            const nodeKeys = section.nodeKeys ?? [];
            if (nodeKeys.length > 0) {
              const result = await trendingDataService.queryTrendingData({
                nodeKeys,
                machineId: section.machineId,
                startDate,
                endDate,
              });
              sections.push(
                renderTrendingSection(
                  section.title ?? "Trending Data",
                  result.series,
                ),
              );
            }
            break;
          }
          case "alerts":
            sections.push(renderAlertSection(section.title ?? "Alerts"));
            break;
          case "oee":
            sections.push(renderOeeSection(section.title ?? "OEE Summary"));
            break;
          default:
            sections.push(
              `<h2>${escapeHtml(section.title ?? section.type)}</h2><p>Section type "${escapeHtml(section.type)}" not yet implemented.</p>`,
            );
        }
      }

      // If no sections configured, add a default note
      if (sections.length === 0) {
        sections.push(
          '<div class="summary-box"><p>No report sections configured in the template.</p></div>',
        );
      }

      const html = renderHtmlReport(reportTitle, sections, now);

      // Generate PDF with Puppeteer
      const pdfFilename = `report-${schedule.id}-${formatDate(now)}.pdf`;
      const pdfPath = path.join(REPORTS_DIR, pdfFilename);

      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        await page.pdf({
          path: pdfPath,
          format: "A4",
          printBackground: true,
          margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
        });
      } finally {
        await browser.close();
      }

      const stats = fs.statSync(pdfPath);

      // Update history with completed status
      await reportRepository.updateHistoryStatus(historyEntry.id, {
        status: "completed",
        filePath: pdfPath,
        fileSize: stats.size,
        completedAt: new Date(),
      });

      // Update schedule last run info
      await reportRepository.updateSchedule(schedule.id, {
        lastRunAt: new Date(),
        lastRunStatus: "completed",
      } as any);

      logger.info(
        `[ReportGenerator] Report generated: ${pdfPath} (${stats.size} bytes)`,
      );

      // Send email if recipients are configured
      const recipients = (schedule.recipients ?? []) as string[];
      if (recipients.length > 0) {
        try {
          await reportEmailService.sendReport(
            recipients,
            `Scheduled Report: ${schedule.name}`,
            `Please find attached the report "${reportTitle}" generated on ${now.toISOString()}.`,
            pdfPath,
          );
        } catch (emailErr) {
          logger.error(
            `[ReportGenerator] Failed to send email for schedule ${scheduleId}:`,
            emailErr,
          );
          // Email failure does not mark the report itself as failed
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await reportRepository.updateHistoryStatus(historyEntry.id, {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
      });

      await reportRepository.updateSchedule(schedule.id, {
        lastRunAt: new Date(),
        lastRunStatus: "failed",
      } as any);

      logger.error(
        `[ReportGenerator] Failed to generate report for schedule ${scheduleId}:`,
        err,
      );
    }
  }
}

export const reportGeneratorService = new ReportGeneratorService();
