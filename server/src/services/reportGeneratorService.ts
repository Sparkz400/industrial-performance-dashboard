import fs from "node:fs";
import path from "node:path";
import { reportRepository } from "../repositories/reportRepository.js";
import { alertRepository } from "../repositories/alertRepository.js";
import { trendingDataService } from "./trendingDataService.js";
import { oeeCalculationService } from "./oeeCalculationService.js";
import { reportEmailService } from "./reportEmailService.js";
import { writeReportPdf, type ReportSection } from "./reportPdf.js";
import logger from "../utils/logger.js";
import type {
  ScheduledReportConfig,
  ScheduledReportSection,
} from "@performance-dashboard/shared";

async function collectSection(
  section: ScheduledReportSection,
  start: Date,
  end: Date,
  timezone: string,
): Promise<ReportSection> {
  const title =
    section.title ??
    { trending: "Trending Data", alerts: "Alerts", oee: "OEE Summary" }[
      section.type
    ] ??
    section.type;
  const number = (value: number | null | undefined, digits = 2) =>
    value != null && Number.isFinite(value) ? value.toFixed(digits) : "N/A";
  if (section.type === "trending") {
    if (!section.machineId)
      return {
        title,
        paragraphs: [
          "Trending unavailable: select one machine in this report section.",
        ],
      };
    if (!section.nodeKeys?.length)
      return { title, paragraphs: ["No tags configured for this section."] };
    const result = await trendingDataService.queryTrendingData({
      machineId: section.machineId,
      nodeKeys: section.nodeKeys,
      startDate: start,
      endDate: end,
    });
    return {
      title,
      paragraphs: result.series.length ? [] : ["No data available."],
      table: {
        headers: [
          "Tag",
          "Latest displayed",
          "Avg",
          "Min",
          "Max",
          "Points / coverage",
        ],
        widths: [100, 60, 45, 45, 45, 216],
        rows: result.series.map((series) => [
          series.displayName,
          number(series.data.at(-1)?.value),
          number(series.statistics?.average),
          number(series.statistics?.min),
          number(series.statistics?.max),
          `${series.goodSampleCount ?? 0}/${series.sampleCount ?? 0} usable samples; ${series.resolutionMs ?? 0} ms buckets; ${series.truncated ? "TRUNCATED" : "full query window"}; continuity unverified`,
        ]),
      },
    };
  }
  if (section.type === "alerts") {
    const alerts = await alertRepository.listAlertHistory({
      startDate: start,
      endDate: end,
      limit: 200,
      ...(section.machineId ? { machineId: section.machineId } : {}),
    });
    if (!alerts.length)
      return { title, paragraphs: ["No alerts recorded in this period."] };
    const severities: Record<string, number> = {};
    for (const alert of alerts)
      severities[alert.severity ?? "unknown"] =
        (severities[alert.severity ?? "unknown"] ?? 0) + 1;
    return {
      title,
      paragraphs: [
        `Alerts shown: ${alerts.length}. ${Object.entries(severities)
          .map(([severity, count]) => `${severity}: ${count}`)
          .join(
            "; ",
          )}${alerts.length === 200 ? ". Display limit reached: additional alerts may exist." : ""}`,
      ],
      table: {
        headers: ["Time", "Severity", "Status", "Rule", "Message", "Value"],
        widths: [83, 48, 54, 77, 201, 48],
        rows: alerts.map((alert) => [
          alert.createdAt
            ? new Date(alert.createdAt).toLocaleString("en-GB", {
                timeZone: timezone,
              })
            : "N/A",
          alert.severity ?? "N/A",
          alert.status ?? "N/A",
          alert.ruleName ?? "N/A",
          alert.message ?? "",
          String(alert.triggerValue ?? "N/A"),
        ]),
      },
    };
  }
  if (section.type === "oee") {
    if (!section.machineId)
      return { title, paragraphs: ["No machine configured for OEE section."] };
    try {
      const result = await oeeCalculationService.calculateOee(
        section.machineId,
        start,
        end,
      );
      const pct = (value: number) =>
        Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";
      return {
        title,
        paragraphs: [
          ...(result.dataComplete
            ? []
            : [
                "Incomplete measurement coverage. These figures are provisional.",
              ]),
          `OEE: ${pct(result.oee)}`,
        ],
        table: {
          headers: ["Metric", "Value", "Details"],
          widths: [110, 80, 321],
          rows: [
            [
              "Availability",
              pct(result.availability.availability),
              `Running: ${number(result.availability.runningTimeMinutes, 1)} min, Planned stop: ${number(result.availability.plannedStopTimeMinutes, 1)} min`,
            ],
            [
              "Performance",
              pct(result.performance.performance),
              `Total count: ${result.performance.totalCount}`,
            ],
            [
              "Quality",
              pct(result.quality.quality),
              `Good: ${result.quality.goodCount}, Rejected: ${result.quality.rejectCount}`,
            ],
          ],
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        `[ReportGenerator] OEE section failed for machine ${section.machineId}: ${message}`,
      );
      return { title, paragraphs: [`OEE data unavailable: ${message}`] };
    }
  }
  return {
    title,
    paragraphs: [`Section type "${section.type}" is not implemented.`],
  };
}

class ReportGeneratorService {
  private running = new Set<number>();

  async generate(scheduleId: number): Promise<void> {
    if (this.running.has(scheduleId)) return;
    this.running.add(scheduleId);
    try {
      await this.generateOnce(scheduleId);
    } finally {
      this.running.delete(scheduleId);
    }
  }

  private async generateOnce(scheduleId: number): Promise<void> {
    const schedule = await reportRepository.findScheduleById(scheduleId);
    if (!schedule) {
      logger.warn(`[ReportGenerator] Schedule ${scheduleId} not found`);
      return;
    }
    const template = await reportRepository.findTemplateById(
      schedule.templateId,
    );
    if (!template) {
      logger.warn(
        `[ReportGenerator] Template ${schedule.templateId} not found`,
      );
      return;
    }
    const history = await reportRepository.createHistory({
      scheduleId,
      templateId: template.id,
      scheduleName: schedule.name,
      status: "generating",
    });
    try {
      const config = (template.templateConfig ?? {}) as ScheduledReportConfig;
      const title = config.title ?? template.name ?? "Report";
      const now = new Date();
      const hours = config.lookbackHours ?? 24;
      if (!Number.isFinite(hours) || hours <= 0 || hours > 744)
        throw new Error("Report window must be between 0 and 744 hours");
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const timezone = schedule.timezone ?? "UTC";
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now);
      const sections: ReportSection[] = [];
      for (const section of config.sections ?? []) {
        const machines = section.machineId
          ? [section.machineId]
          : ((schedule.machineIds ?? []) as number[]);
        for (const machineId of machines.length ? machines : [undefined]) {
          const result = await collectSection(
            { ...section, machineId },
            start,
            now,
            timezone,
          );
          if (machineId) result.title += ` - Machine ${machineId}`;
          sections.push(result);
        }
      }
      if (!sections.length)
        sections.push({
          title: "Report",
          paragraphs: ["No report sections configured in the template."],
        });
      const directory = path.resolve(process.env.REPORTS_DIR || "reports");
      fs.mkdirSync(directory, { recursive: true });
      const pdfPath = path.join(
        directory,
        `report-${scheduleId}-${history.id}.pdf`,
      );
      await writeReportPdf(pdfPath, {
        title,
        generatedAt: now,
        period: `Period: ${start.toISOString()} to ${now.toISOString()}\nAlert display timezone: ${timezone}`,
        sections,
      });
      await reportRepository.updateHistoryStatus(history.id, {
        status: "completed",
        filePath: pdfPath,
        fileSize: fs.statSync(pdfPath).size,
        completedAt: new Date(),
      });
      await reportRepository.updateSchedule(scheduleId, {
        lastRunAt: now,
        lastRunStatus: "completed",
      });
      const recipients = (schedule.recipients ?? []) as string[];
      if (
        recipients.length &&
        ((schedule.deliveryChannels ?? ["email"]) as string[]).includes("email")
      ) {
        try {
          await reportEmailService.sendReport(
            recipients,
            `Scheduled Report: ${schedule.name}`,
            `Please find attached the report "${title}" generated on ${now.toISOString()}.`,
            pdfPath,
          );
        } catch (error) {
          logger.error(
            `[ReportGenerator] Email delivery failed for schedule ${scheduleId}`,
            error,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reportRepository.updateHistoryStatus(history.id, {
        status: "failed",
        error: message,
        completedAt: new Date(),
      });
      await reportRepository.updateSchedule(scheduleId, {
        lastRunAt: new Date(),
        lastRunStatus: "failed",
      });
      logger.error(
        `[ReportGenerator] Generation failed for schedule ${scheduleId}: ${message}`,
      );
    }
  }
}

export const reportGeneratorService = new ReportGeneratorService();
