import cron, { type ScheduledTask } from "node-cron";
import { CronExpressionParser } from "cron-parser";
import { reportRepository } from "../repositories/reportRepository.js";
import { reportGeneratorService } from "./reportGeneratorService.js";
import logger from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Scheduled Report Job Manager
// ---------------------------------------------------------------------------

class ReportSchedulerService {
  private scheduledJobs = new Map<number, ScheduledTask>();

  /**
   * Initialise the scheduler — load all active schedules from the database
   * and create cron jobs for each.
   */
  async init(): Promise<void> {
    try {
      const schedules = await reportRepository.getAllActiveSchedules();
      for (const schedule of schedules) {
        this.scheduleJob(
          schedule.id,
          schedule.cronExpression,
          schedule.timezone ?? "UTC",
        );
      }
      logger.info(
        `[ReportScheduler] Initialised ${schedules.length} scheduled report jobs`,
      );
    } catch (err) {
      logger.error("[ReportScheduler] Failed to initialise:", err);
    }
  }

  /**
   * Create (or replace) a cron job for the given schedule.
   */
  scheduleJob(
    scheduleId: number,
    cronExpression: string,
    timezone = "UTC",
  ): void {
    // Stop any existing job for this schedule
    this.unscheduleJob(scheduleId);

    if (!this.calculateNextRun(cronExpression, timezone)) {
      logger.warn(
        `[ReportScheduler] Invalid cron expression for schedule ${scheduleId}: "${cronExpression}"`,
      );
      return;
    }

    const task = cron.schedule(
      cronExpression,
      async () => {
        logger.info(
          `[ReportScheduler] Cron tick — generating report for schedule ${scheduleId}`,
        );
        try {
          await reportGeneratorService.generate(scheduleId);
        } catch (err) {
          logger.error(
            `[ReportScheduler] Report generation failed for schedule ${scheduleId}:`,
            err,
          );
        }
      },
      { timezone, noOverlap: true },
    );

    this.scheduledJobs.set(scheduleId, task);
    logger.debug(
      `[ReportScheduler] Scheduled job ${scheduleId} with cron "${cronExpression}"`,
    );
  }

  /**
   * Stop and remove the cron job for a given schedule.
   */
  unscheduleJob(scheduleId: number): void {
    const existing = this.scheduledJobs.get(scheduleId);
    if (existing) {
      void existing.destroy();
      this.scheduledJobs.delete(scheduleId);
      logger.debug(`[ReportScheduler] Unscheduled job ${scheduleId}`);
    }
  }

  /**
   * Tear down all existing jobs and re-read from the database.
   */
  async refreshAll(): Promise<void> {
    // Stop all existing jobs
    this.stop();

    // Reload from DB
    await this.init();
  }

  stop(): void {
    for (const id of this.scheduledJobs.keys()) this.unscheduleJob(id);
  }

  /**
   * Compute the next run time for a cron expression relative to now.
   * Returns an ISO string or null if the expression is invalid.
   */
  calculateNextRun(cronExpression: string, timezone?: string): string | null {
    if (!cron.validate(cronExpression)) return null;

    try {
      const options: { tz?: string } = {};
      if (timezone) options.tz = timezone;
      const interval = CronExpressionParser.parse(cronExpression, options);
      return interval.next().toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Return the number of currently active jobs (useful for health checks).
   */
  get activeJobCount(): number {
    return this.scheduledJobs.size;
  }
}

export const reportSchedulerService = new ReportSchedulerService();
