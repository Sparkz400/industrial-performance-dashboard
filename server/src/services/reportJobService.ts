import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import config from "../config/config.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { CronExpressionParser } from "cron-parser";
import db from "../database/db.js";
import manager from "../database/dbConnection.js";
import {
  reportHistory,
  reportSchedules,
  reportTemplates,
  type ReportSnapshot,
} from "../database/schema.js";
import { renderScheduledReport } from "./reportGeneratorService.js";
import { reportEmailService } from "./reportEmailService.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import logger from "../utils/logger.js";

export function nextReportRun(
  cronExpression: string,
  timezone = "UTC",
  after = new Date(),
): Date | null {
  try {
    return CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: after,
    })
      .next()
      .toDate();
  } catch {
    return null;
  }
}
export function reportRetry(attempts: number, now = new Date()): Date | null {
  return attempts >= 5
    ? null
    : new Date(now.getTime() + Math.min(3600, 30 * 2 ** (attempts - 1)) * 1000);
}

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function enqueue(
  tx: Executor,
  schedule: typeof reportSchedules.$inferSelect,
  at: Date,
  runKey: string,
) {
  const [template] = await tx
    .select()
    .from(reportTemplates)
    .where(eq(reportTemplates.id, schedule.templateId));
  if (!template) throw new NotFoundError("Report template");
  const config = template.templateConfig as ReportSnapshot["config"];
  const snapshot: ReportSnapshot = {
    name: schedule.name,
    title: config.title ?? template.name,
    config,
    timezone: schedule.timezone ?? "UTC",
    machineIds: (schedule.machineIds ?? []) as number[],
    recipients: (schedule.recipients ?? []) as string[],
    email: ((schedule.deliveryChannels ?? []) as string[]).includes("email"),
  };
  const [created] = await tx
    .insert(reportHistory)
    .values({
      scheduleId: schedule.id,
      templateId: template.id,
      scheduleName: schedule.name,
      runKey,
      scheduledFor: at,
      snapshot,
      status: "queued",
      retryAt: new Date(),
      emailRemaining: snapshot.recipients,
    })
    .onConflictDoNothing({ target: reportHistory.runKey })
    .returning();
  if (created) return created;
  const [existing] = await tx
    .select()
    .from(reportHistory)
    .where(eq(reportHistory.runKey, runKey));
  return existing;
}

class ReportJobService {
  private processing = false;

  async enqueueManual(scheduleId: number, requestId = randomUUID()) {
    return db.transaction(async (tx) => {
      const [schedule] = await tx
        .select()
        .from(reportSchedules)
        .where(eq(reportSchedules.id, scheduleId));
      if (!schedule) throw new NotFoundError("Report schedule");
      return enqueue(
        tx,
        schedule,
        new Date(),
        `manual:${scheduleId}:${requestId}`,
      );
    });
  }

  async enqueueDue(now = new Date()): Promise<number> {
    const schedules = await db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.isActive, true));
    // Keep each catch-up bounded; the persisted cursor retains every remaining slot.
    let remaining = 20;
    for (const candidate of schedules.sort(
      (a, b) => (a.nextRunAt?.getTime() ?? 0) - (b.nextRunAt?.getTime() ?? 0),
    )) {
      if (!remaining) break;
      if (candidate.nextRunAt && candidate.nextRunAt > now) continue;
      remaining -= await db.transaction(async (tx) => {
        const [schedule] = await tx
          .select()
          .from(reportSchedules)
          .where(
            and(
              eq(reportSchedules.id, candidate.id),
              eq(reportSchedules.isActive, true),
            ),
          )
          .for("update");
        if (!schedule) return 0;
        let at = schedule.nextRunAt;
        if (!at) {
          at = nextReportRun(
            schedule.cronExpression,
            schedule.timezone ?? "UTC",
            now,
          );
          if (!at)
            throw new ValidationError("Invalid persisted report schedule");
          await tx
            .update(reportSchedules)
            .set({ nextRunAt: at })
            .where(eq(reportSchedules.id, schedule.id));
          return 0;
        }
        let count = 0;
        while (at <= now && count < remaining) {
          await enqueue(
            tx,
            schedule,
            at,
            `scheduled:${schedule.id}:${at.toISOString()}`,
          );
          const next = nextReportRun(
            schedule.cronExpression,
            schedule.timezone ?? "UTC",
            at,
          );
          if (!next || next <= at)
            throw new ValidationError("Invalid persisted report schedule");
          at = next;
          count++;
        }
        if (count)
          await tx
            .update(reportSchedules)
            .set({ nextRunAt: at })
            .where(eq(reportSchedules.id, schedule.id));
        return count;
      });
    }
    return schedules.length;
  }

  async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      const rows = await db
        .select({ id: reportHistory.id })
        .from(reportHistory)
        .where(
          and(
            isNotNull(reportHistory.snapshot),
            or(
              inArray(reportHistory.status, ["queued", "generating"]),
              and(
                eq(reportHistory.status, "failed"),
                lte(reportHistory.retryAt, now),
              ),
              and(
                eq(reportHistory.status, "completed"),
                or(
                  inArray(reportHistory.emailStatus, ["queued", "sending"]),
                  lte(reportHistory.emailRetryAt, now),
                ),
              ),
            ),
          ),
        )
        .orderBy(asc(reportHistory.id))
        .limit(20);
      for (const row of rows) await this.processOne(row.id);
    } finally {
      this.processing = false;
    }
  }

  private async processOne(id: number): Promise<void> {
    const client = await manager.pool.connect();
    // The lock connection also performs every job mutation, so a lost lock cannot commit a render.
    const connectionError = () => {
      /* The following query fails and the next worker recovers this job. */
    };
    client.on("error", connectionError);
    let locked = false;
    try {
      locked = (
        await client.query("SELECT pg_try_advisory_lock(8744, $1) AS locked", [
          id,
        ])
      ).rows[0].locked;
      if (!locked) return;
      const writer = drizzle(client);
      let [job] = await writer
        .select()
        .from(reportHistory)
        .where(eq(reportHistory.id, id));
      if (!job?.snapshot || !job.scheduledFor) return;
      if (job.status !== "completed") {
        if (
          job.status === "failed" &&
          (!job.retryAt || job.retryAt > new Date())
        )
          return;
        if (job.attempts >= 5) {
          await writer
            .update(reportHistory)
            .set({
              status: "failed",
              error:
                "Generation interrupted repeatedly; inspect storage and retry manually",
              retryAt: null,
            })
            .where(eq(reportHistory.id, id));
          return;
        }
        const attempts = job.attempts + 1;
        await writer
          .update(reportHistory)
          .set({ status: "generating", attempts, retryAt: null, error: null })
          .where(eq(reportHistory.id, id));
        try {
          const artifact = await renderScheduledReport({
            id,
            scheduledFor: job.scheduledFor,
            snapshot: job.snapshot,
          });
          const email =
            job.snapshot.email && job.snapshot.recipients.length > 0;
          [job] = await writer
            .update(reportHistory)
            .set({
              ...artifact,
              status: "completed",
              completedAt: new Date(),
              emailStatus: email ? "queued" : "not-requested",
              emailRetryAt: email ? new Date() : null,
            })
            .where(eq(reportHistory.id, id))
            .returning();
          if (job.scheduleId)
            await writer
              .update(reportSchedules)
              .set({ lastRunAt: new Date(), lastRunStatus: "completed" })
              .where(eq(reportSchedules.id, job.scheduleId));
        } catch (error) {
          await writer
            .update(reportHistory)
            .set({
              status: "failed",
              error:
                error instanceof Error
                  ? error.message.slice(0, 1000)
                  : "Report generation failed",
              retryAt: reportRetry(attempts),
            })
            .where(eq(reportHistory.id, id));
          if (job.scheduleId)
            await writer
              .update(reportSchedules)
              .set({ lastRunAt: new Date(), lastRunStatus: "failed" })
              .where(eq(reportSchedules.id, job.scheduleId));
          return;
        }
      }
      if (
        !job.filePath ||
        !job.snapshot ||
        !["queued", "sending", "retrying", "blocked"].includes(
          job.emailStatus,
        ) ||
        (job.emailRetryAt && job.emailRetryAt > new Date())
      )
        return;
      if (!reportEmailService.configured) {
        await writer
          .update(reportHistory)
          .set({
            emailStatus: "blocked",
            emailError: "SMTP is not configured",
            emailRetryAt: new Date(Date.now() + 60000),
          })
          .where(eq(reportHistory.id, id));
        return;
      }
      if (job.emailAttempts >= 5) {
        await writer
          .update(reportHistory)
          .set({
            emailStatus: "failed",
            emailError:
              "Delivery interrupted repeatedly; inspect SMTP and retry manually",
            emailRetryAt: null,
          })
          .where(eq(reportHistory.id, id));
        return;
      }
      const attempts = job.emailAttempts + 1;
      const recipients = job.emailRemaining ?? job.snapshot.recipients;
      await writer
        .update(reportHistory)
        .set({
          emailStatus: "sending",
          emailAttempts: attempts,
          emailRetryAt: null,
        })
        .where(eq(reportHistory.id, id));
      try {
        const messageId = `<pd-${createHash("sha256").update(job.runKey!).digest("hex")}@performance-dashboard.local>`;
        const remaining = await reportEmailService.sendReport(
          recipients,
          `Scheduled Report: ${job.snapshot.name}`,
          `Report "${job.snapshot.title}" for the period ending ${job.scheduledFor!.toISOString()}.`,
          job.filePath,
          messageId,
        );
        const retryAt = remaining.length ? reportRetry(attempts) : null;
        await writer
          .update(reportHistory)
          .set({
            emailStatus: remaining.length
              ? retryAt
                ? "retrying"
                : "failed"
              : "sent",
            emailRemaining: remaining,
            emailRetryAt: retryAt,
            emailError: remaining.length
              ? "SMTP rejected some recipients"
              : null,
          })
          .where(eq(reportHistory.id, id));
      } catch {
        const retryAt = reportRetry(attempts);
        await writer
          .update(reportHistory)
          .set({
            emailStatus: retryAt ? "retrying" : "failed",
            emailRetryAt: retryAt,
            emailError: "SMTP delivery failed; check the mail server and retry",
          })
          .where(eq(reportHistory.id, id));
      }
    } catch (error) {
      logger.error(`[ReportJobs] Could not process job ${id}`, error);
    } finally {
      let broken = false;
      if (locked)
        try {
          await client.query("SELECT pg_advisory_unlock(8744, $1)", [id]);
        } catch {
          broken = true;
        }
      client.off("error", connectionError);
      client.release(broken);
    }
  }

  async retry(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(reportHistory)
        .where(eq(reportHistory.id, id))
        .for("update");
      if (!job?.snapshot)
        throw new ValidationError(
          "This historical report has no saved job; run its schedule again",
        );
      // Never wait for a running delivery while holding the row lock.
      const lock = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(8744, ${id}) AS locked`,
      );
      if (!lock.rows[0]?.locked)
        throw new ValidationError("This report is currently running");
      if (job.status === "failed")
        await tx
          .update(reportHistory)
          .set({
            status: "queued",
            attempts: 0,
            retryAt: new Date(),
            error: null,
          })
          .where(eq(reportHistory.id, id));
      else if (
        job.status === "completed" &&
        ["failed", "blocked", "retrying"].includes(job.emailStatus)
      )
        await tx
          .update(reportHistory)
          .set({
            emailStatus: "queued",
            emailAttempts: 0,
            emailRetryAt: new Date(),
            emailError: null,
          })
          .where(eq(reportHistory.id, id));
    });
  }

  /** Opt-in PDF retention: only files inside the reports directory and not awaiting email. */
  async pruneFiles(
    days = config.REPORT_RETENTION_DAYS,
    now = new Date(),
  ): Promise<number> {
    if (!days) return 0;
    const root = path.resolve(process.env.REPORTS_DIR || "reports") + path.sep;
    const rows = await db
      .select({
        id: reportHistory.id,
        filePath: reportHistory.filePath,
        metadata: reportHistory.metadata,
      })
      .from(reportHistory)
      .where(
        and(
          isNotNull(reportHistory.filePath),
          lte(
            reportHistory.completedAt,
            new Date(now.getTime() - days * 86_400_000),
          ),
          notInArray(reportHistory.emailStatus, [
            "queued",
            "sending",
            "retrying",
            "blocked",
          ]),
        ),
      )
      .limit(500);
    let removed = 0;
    for (const row of rows) {
      const file = path.resolve(row.filePath!);
      if (!file.startsWith(root)) {
        logger.warn(
          `[Reports] Retention skipped a file outside ${root}: ${file}`,
        );
        continue;
      }
      // Clear the pointer first: a crash leaves an orphan file, never a dangling download.
      await db
        .update(reportHistory)
        .set({
          filePath: null,
          metadata: {
            ...(row.metadata as Record<string, unknown>),
            fileRemovedAt: now.toISOString(),
            retentionDays: days,
          },
        })
        .where(eq(reportHistory.id, row.id));
      await rm(file, { force: true });
      removed++;
    }
    return removed;
  }

  async markLegacyInterrupted(): Promise<void> {
    await db
      .update(reportHistory)
      .set({
        status: "failed",
        error:
          "Generation was interrupted before durable job support; run the schedule again",
      })
      .where(
        and(
          isNull(reportHistory.snapshot),
          eq(reportHistory.status, "generating"),
        ),
      );
  }
}
export const reportJobService = new ReportJobService();
