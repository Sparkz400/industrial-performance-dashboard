import Joi from "joi";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, desc, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  workOrderImports,
  productionShifts,
  machineProfiles,
  shiftReportRevisions,
} from "../database/schema.js";
import config from "../config/config.js";
import { canonicalJson } from "../utils/canonicalJson.js";
import { ConflictError } from "../utils/errors.js";
import type {
  ProductionProfile,
  ShiftReport,
} from "@performance-dashboard/shared";

export interface WorkOrder {
  externalId: string;
  product: string;
  target: number | null;
  start: string;
  end: string;
  timezone: string;
}
export interface OrderDocument {
  version: "work-orders-v1";
  source: string;
  orders: unknown[];
}
interface ReviewedRow {
  index: number;
  externalId: string;
  status: "ready" | "unchanged" | "rejected";
  reason?: string;
  order?: WorkOrder;
  shiftId?: number;
}
interface Review {
  machineId: number;
  actorId: number;
  inputDigest: string;
  profileDigest: string | null;
  expiresAt: string;
  rows: ReviewedRow[];
}
export const orderDocumentSchema = Joi.object({
  version: Joi.string().valid("work-orders-v1").required(),
  source: Joi.string().trim().min(1).max(80).required(),
  orders: Joi.array().items(Joi.any()).min(1).max(100).required(),
}).required();
const instant = Joi.string()
  .isoDate()
  .strict()
  .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
  .required();
const orderSchema = Joi.object({
  externalId: Joi.string().trim().min(1).max(160).required(),
  product: Joi.string().trim().min(1).max(160).required(),
  target: Joi.number()
    .integer()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .allow(null)
    .required(),
  start: instant,
  end: instant,
  timezone: Joi.string().max(80).required(),
})
  .unknown(false)
  .required();
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
const sign = (review: Review) =>
  createHmac("sha256", config.SESSION_SECRET)
    .update(canonicalJson(review))
    .digest("hex");

export function parseWorkOrders(document: OrderDocument): ReviewedRow[] {
  const rows: ReviewedRow[] = document.orders.map((value, index) => {
    const parsed = orderSchema.validate(value, { abortEarly: false });
    const externalId =
      typeof value === "object" &&
      value !== null &&
      "externalId" in value &&
      typeof value.externalId === "string"
        ? value.externalId.slice(0, 160)
        : "";
    if (parsed.error)
      return {
        index,
        externalId,
        status: "rejected",
        reason: parsed.error.details.map((d) => d.message).join("; "),
      };
    const order = parsed.value as WorkOrder;
    const duration = Date.parse(order.end) - Date.parse(order.start);
    if (!(duration > 0 && duration <= 48 * 3600000))
      return {
        index,
        externalId,
        status: "rejected",
        reason: "Order duration must be positive and at most 48 hours",
      };
    try {
      new Intl.DateTimeFormat("en", { timeZone: order.timezone });
    } catch {
      return {
        index,
        externalId,
        status: "rejected",
        reason: "Unknown timezone",
      };
    }
    return {
      index,
      externalId: order.externalId,
      status: "ready",
      order: {
        ...order,
        start: new Date(order.start).toISOString(),
        end: new Date(order.end).toISOString(),
      },
    };
  });
  const counts = new Map<string, number>();
  for (const row of rows)
    if (row.order)
      counts.set(row.externalId, (counts.get(row.externalId) ?? 0) + 1);
  for (const row of rows)
    if (row.order && counts.get(row.externalId)! > 1) {
      row.status = "rejected";
      row.reason = "Duplicate external ID in this document";
    }
  return rows;
}

export async function exchangeOrders(
  machineId: number,
  actorId: number,
  document: OrderDocument,
  confirmation?: { review: Review; token: string },
) {
  if (confirmation) {
    const { review, token } = confirmation;
    const expected = sign(review);
    if (
      !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected)) ||
      review.machineId !== machineId ||
      review.actorId !== actorId ||
      review.inputDigest !== digest(document) ||
      Date.parse(review.expiresAt) <= Date.now()
    )
      throw new ConflictError(
        "Review expired or changed; preview this document again",
      );
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"work-orders:" + document.source}))`,
    );
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${machineId}::integer)`);
    const [profile] = await tx
      .select()
      .from(machineProfiles)
      .where(eq(machineProfiles.machineId, machineId))
      .orderBy(desc(machineProfiles.id))
      .limit(1);
    const profileDigest = profile ? digest(profile.profile) : null;
    const rows = parseWorkOrders(document);
    const accepted: WorkOrder[] = [];
    for (const row of rows) {
      if (row.status === "rejected" || !row.order) continue;
      const [existing] = await tx
        .select()
        .from(workOrderImports)
        .where(
          and(
            eq(workOrderImports.source, document.source),
            eq(workOrderImports.externalId, row.externalId),
          ),
        );
      if (existing) {
        if (
          existing.machineId === machineId &&
          existing.digest === digest(row.order)
        ) {
          row.status = "unchanged";
          row.shiftId = existing.shiftId;
        } else {
          row.status = "rejected";
          row.reason =
            "External ID already exists with different data; existing work is preserved";
        }
        continue;
      }
      if (!profile) {
        row.status = "rejected";
        row.reason = "Commission a production profile for this machine first";
        continue;
      }
      const [overlap] = await tx
        .select({ id: productionShifts.id })
        .from(productionShifts)
        .where(
          and(
            eq(productionShifts.machineId, machineId),
            sql`${productionShifts.start} < ${row.order.end}::timestamptz AND ${productionShifts.end} > ${row.order.start}::timestamptz`,
          ),
        )
        .limit(1);
      if (
        overlap ||
        accepted.some(
          (a) => a.start < row.order!.end && a.end > row.order!.start,
        )
      ) {
        row.status = "rejected";
        row.reason =
          "Order overlaps an existing shift or another accepted order";
        continue;
      }
      accepted.push(row.order);
    }
    if (!confirmation) {
      const review: Review = {
        machineId,
        actorId,
        inputDigest: digest(document),
        profileDigest,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        rows,
      };
      return {
        review,
        token: sign(review),
        applied: false,
        source: document.source,
      };
    }
    for (const row of rows) {
      const approved = confirmation.review.rows[row.index];
      if (!approved || approved.externalId !== row.externalId)
        throw new ConflictError("Review changed; preview again");
      if (approved.status === "rejected") {
        row.status = "rejected";
        row.reason = approved.reason;
        continue;
      }
      if (
        row.status === "rejected" ||
        (row.status === "ready" &&
          profileDigest !== confirmation.review.profileDigest)
      )
        throw new ConflictError(
          "Orders or machine profile changed; preview again",
        );
      if (row.status === "unchanged") continue;
      const order = row.order!;
      const [shift] = await tx
        .insert(productionShifts)
        .values({
          machineId,
          name: order.externalId,
          timezone: order.timezone,
          start: new Date(order.start),
          end: new Date(order.end),
          profile: profile!.profile as ProductionProfile,
          job: {
            reference: order.externalId,
            product: order.product,
            target: order.target,
          },
          breaks: [],
          createdBy: actorId,
        })
        .returning({ id: productionShifts.id });
      await tx.insert(workOrderImports).values({
        source: document.source,
        externalId: order.externalId,
        machineId,
        shiftId: shift.id,
        payload: order,
        digest: digest(order),
        createdBy: actorId,
      });
      row.shiftId = shift.id;
    }
    return {
      review: { ...confirmation.review, rows },
      applied: true,
      source: document.source,
    };
  });
}

export async function exportOrderCompletions(machineId: number) {
  const orders = await db
    .select()
    .from(workOrderImports)
    .where(eq(workOrderImports.machineId, machineId))
    .orderBy(desc(workOrderImports.id))
    .limit(101);
  const rows = [];
  for (const order of orders.slice(0, 100)) {
    const [revision] = await db
      .select()
      .from(shiftReportRevisions)
      .where(eq(shiftReportRevisions.shiftId, order.shiftId))
      .orderBy(desc(shiftReportRevisions.id))
      .limit(1);
    const snapshot = revision?.snapshot as ShiftReport | undefined;
    const intact = !!revision && digest(snapshot) === revision.digest;
    rows.push({
      source: order.source,
      externalId: order.externalId,
      shiftId: order.shiftId,
      importedAt: order.createdAt,
      importedBy: order.createdBy,
      status: !revision
        ? "no-saved-report"
        : !intact
          ? "invalid-report"
          : snapshot!.verified
            ? "reconciled"
            : "unverified",
      revision: intact
        ? {
            id: revision.id,
            digest: revision.digest,
            createdAt: revision.createdAt,
            createdBy: revision.createdBy,
          }
        : null,
      facts: intact
        ? {
            start: snapshot!.start,
            end: snapshot!.end,
            product: snapshot!.job.product,
            quantities: snapshot!.quantities,
            observedSeconds: snapshot!.observedSeconds,
            unknownSeconds: snapshot!.seconds.unknown,
            issues: snapshot!.issues,
            verified: snapshot!.verified,
          }
        : null,
    });
  }
  return {
    version: "work-order-completions-v1",
    machineId,
    generatedAt: new Date().toISOString(),
    rows,
    truncated: orders.length > 100,
  };
}
