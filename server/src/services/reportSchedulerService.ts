import { reportJobService, nextReportRun } from "./reportJobService.js";
import logger from "../utils/logger.js";

class ReportSchedulerService {
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;
  private active = 0;
  private legacyChecked = false;
  async init(): Promise<void> {
    this.stop();
    this.start();
    await this.tick();
  }
  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 1000);
    this.timer.unref();
  }
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      if (!this.legacyChecked) {
        await reportJobService.markLegacyInterrupted();
        this.legacyChecked = true;
      }
      this.active = await reportJobService.enqueueDue();
      await reportJobService.processPending();
    } catch (error) {
      logger.error("[ReportScheduler] Durable report processing failed", error);
    } finally {
      this.ticking = false;
    }
  }
  async refreshAll(): Promise<void> {
    this.start();
    this.active = await reportJobService.enqueueDue();
    void this.tick();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.active = 0;
  }
  calculateNextRun(cronExpression: string, timezone = "UTC"): string | null {
    return nextReportRun(cronExpression, timezone)?.toISOString() ?? null;
  }
  get activeJobCount(): number {
    return this.active;
  }
}
export const reportSchedulerService = new ReportSchedulerService();
