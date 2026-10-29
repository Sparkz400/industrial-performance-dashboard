import { createHash } from "node:crypto";
import Joi from "joi";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lte,
  max,
} from "drizzle-orm";
import config from "../config/config.js";
import db from "../database/db.js";
import {
  edgeLink,
  machineProfiles,
  machines,
  opcuaData,
} from "../database/schema.js";
import { holdsCollectorLock } from "./collectorLock.js";
import { openSecret, sealSecret } from "./machineIdentity.js";
import { pinnedFetch } from "../utils/pinnedFetch.js";
import { AppError, ConflictError } from "../utils/errors.js";
import logger from "../utils/logger.js";

// H08/E04 edge side: ships committed measurements to the central installation and advances
// its cursor only when the central installation acknowledges a committed batch.
const SCHEMA_VERSION = 1;
const SETTINGS_SCHEMA_VERSIONS = [1];
// shortcut: rows are shipped only up to an id recorded EDGE_SETTLE_MS earlier, so writes still
// open at that moment can commit first; a measurement transaction open longer than that
// would be skipped. Upgrade to a commit-ordered outbox if such writers appear.
const MAX_BACKOFF_MS = 300_000;
const settingsSchema = Joi.object({
  syncIntervalSeconds: Joi.number().integer().min(5).max(3600),
  batchSize: Joi.number().integer().min(50).max(5000),
});
const TOKEN_CONTEXT = "edge-link";
export const softwareVersion = () =>
  (process.env.SOURCE_REVISION || "unversioned").slice(0, 40);

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<unknown> | undefined;
let stopped = true;
let failures = 0;
let settled: number | undefined;

async function link() {
  const [row] = await db.select().from(edgeLink).where(eq(edgeLink.id, 1));
  return row;
}

async function central(
  row: { centralUrl: string; caCertificate: string },
  path: string,
  body: unknown,
  token?: string,
) {
  const response = await pinnedFetch(row.caCertificate)(
    new URL(`/api/v1/edge-sync/${path}`, row.centralUrl).href,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  ).catch((error) => {
    // TLS (wrong CA, wrong name), DNS, refused or reset connections.
    throw new AppError(
      `Central installation unreachable: ${error instanceof Error ? error.message : String(error)}`,
      502,
      "EDGE_CENTRAL_UNREACHABLE",
    );
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* reported below by status */
  }
  if (!response.ok)
    throw new AppError(
      `Central installation answered ${response.status}: ${String(json.error ?? text).slice(0, 300)}`,
      502,
      response.status === 401 ? "EDGE_UNAUTHORIZED" : "EDGE_CENTRAL_ERROR",
    );
  return json;
}

/** Validates a central configuration revision; an incompatible one is rejected, not applied. */
export function checkEdgeConfig(revision: {
  schemaVersion: unknown;
  settings: unknown;
}) {
  if (!SETTINGS_SCHEMA_VERSIONS.includes(Number(revision.schemaVersion)))
    return {
      error: `Configuration schema ${String(revision.schemaVersion)} is not supported by this edge (supports ${SETTINGS_SCHEMA_VERSIONS.join(", ")})`,
    };
  const { value, error } = settingsSchema.validate(revision.settings, {
    convert: false,
  });
  return error
    ? { error: `Configuration rejected: ${error.message}` }
    : { value };
}

export const edgeSync = {
  async status() {
    const row = await link();
    if (!row) return { linked: false as const };
    const { sealedToken: _token, ...visible } = row;
    const [{ backlog }] = await db
      .select({ backlog: count() })
      .from(opcuaData)
      .where(and(gt(opcuaData.id, row.cursor), isNotNull(opcuaData.machineId)));
    return {
      linked: true as const,
      ...visible,
      backlog,
      softwareVersion: softwareVersion(),
    };
  },

  async enroll(
    input: {
      centralUrl: string;
      caCertificate: string;
      enrollmentCode: string;
    },
    userId: number,
  ) {
    if (await link())
      throw new ConflictError(
        "This installation is already linked; unlink it first",
      );
    const answer = await central(input, "enroll", {
      code: input.enrollmentCode,
    });
    const token = String(answer.token ?? "");
    const edge = answer.edge as { name?: string } | undefined;
    if (!token.startsWith("pded_") || !edge?.name)
      throw new AppError("The central installation sent no token", 502);
    // Shipping starts after the existing history: everything already stored is backlog.
    await db.insert(edgeLink).values({
      centralUrl: input.centralUrl,
      caCertificate: input.caCertificate,
      sealedToken: await sealSecret(TOKEN_CONTEXT, { password: token }),
      edgeName: edge.name,
      enrolledBy: userId,
    });
    settled = undefined;
    if (holdsCollectorLock()) this.start();
    return this.status();
  },

  async unlink() {
    await this.stop();
    await db.delete(edgeLink);
    settled = undefined;
  },

  /** Sends at most one batch; returns whether more settled rows remain. */
  async syncOnce() {
    const row = await link();
    if (!row) return false;
    const now = Date.now();
    settled ??= row.cursor;
    if (
      !row.horizonAt ||
      now - row.horizonAt.getTime() >= config.EDGE_SETTLE_MS
    ) {
      if (row.horizonId != null && row.horizonAt)
        settled = Math.max(settled, row.horizonId);
      const [{ newest }] = await db
        .select({ newest: max(opcuaData.id) })
        .from(opcuaData);
      await db
        .update(edgeLink)
        .set({ horizonId: newest ?? 0, horizonAt: new Date(now) })
        .where(eq(edgeLink.id, 1));
    }
    const settings = { ...(row.settings as Record<string, number>) };
    const batchSize = settings.batchSize ?? config.EDGE_SYNC_BATCH_SIZE;
    const rows =
      settled > row.cursor
        ? await db
            .select()
            .from(opcuaData)
            .where(
              and(
                gt(opcuaData.id, row.cursor),
                lte(opcuaData.id, settled),
                // Rows without a machine (single .env connection) have no site; they stay local.
                isNotNull(opcuaData.machineId),
              ),
            )
            .orderBy(asc(opcuaData.id))
            .limit(batchSize)
        : [];
    const full = rows.length === batchSize;
    const cursor = full
      ? rows[rows.length - 1].id
      : Math.max(row.cursor, settled);
    const machineIds = [...new Set(rows.map((r) => r.machineId!))];
    const described = machineIds.length
      ? await db
          .select({ id: machines.id, name: machines.name })
          .from(machines)
          .where(inArray(machines.id, machineIds))
      : [];
    const profiles = machineIds.length
      ? await db
          .select({
            machineId: machineProfiles.machineId,
            profile: machineProfiles.profile,
          })
          .from(machineProfiles)
          .where(inArray(machineProfiles.machineId, machineIds))
          .orderBy(desc(machineProfiles.id))
      : [];
    const definition = (id: number) => {
      const profile = profiles.find((p) => p.machineId === id);
      return profile
        ? createHash("sha256")
            .update(JSON.stringify(profile.profile))
            .digest("hex")
        : null;
    };
    const [{ backlog }] = await db
      .select({ backlog: count() })
      .from(opcuaData)
      .where(and(gt(opcuaData.id, cursor), isNotNull(opcuaData.machineId)));
    const token = String(
      (await openSecret(TOKEN_CONTEXT, row.sealedToken)).password ?? "",
    );
    await db
      .update(edgeLink)
      .set({ lastAttemptAt: new Date() })
      .where(eq(edgeLink.id, 1));
    const answer = await central(
      row,
      "batches",
      {
        schemaVersion: SCHEMA_VERSION,
        softwareVersion: softwareVersion(),
        backlog,
        cursor,
        appliedConfigRevision: row.configRevision,
        configRejection: row.configRejection,
        machines: described.map((m) => ({
          ...m,
          definitionDigest: definition(m.id),
        })),
        rows: rows.map(({ id, machineId, eventId, ...rest }) => ({
          ...rest,
          id,
          machineId,
          eventId,
          // Joi on the central side checks these; only finite numbers are sent as values.
          value: Number.isFinite(rest.value) ? rest.value : null,
        })),
      },
      token,
    );
    // The cursor moves only to what the central installation committed.
    const acknowledged = Number(answer.acknowledged);
    const update: Partial<typeof edgeLink.$inferInsert> = {
      cursor: Number.isInteger(acknowledged)
        ? Math.min(acknowledged, cursor)
        : row.cursor,
      lastSuccessAt: new Date(),
      lastError: null,
    };
    const offered = answer.config as
      | { revision: number; schemaVersion: unknown; settings: unknown }
      | null
      | undefined;
    if (offered && offered.revision > row.configRevision) {
      const checked = checkEdgeConfig(offered);
      if ("value" in checked) {
        update.configRevision = offered.revision;
        update.settings = checked.value;
        update.configRejection = null;
      } else
        update.configRejection = `Revision ${offered.revision}: ${checked.error}`;
    }
    await db.update(edgeLink).set(update).where(eq(edgeLink.id, 1));
    return full;
  },

  start() {
    if (!stopped) return;
    stopped = false;
    const tick = () => {
      pending = this.syncOnce()
        .then(async (more) => {
          failures = 0;
          const row = await link();
          const seconds = (
            row?.settings as { syncIntervalSeconds?: number } | undefined
          )?.syncIntervalSeconds;
          return more
            ? 0
            : seconds
              ? seconds * 1000
              : config.EDGE_SYNC_INTERVAL_MS;
        })
        .catch(async (error) => {
          failures += 1;
          logger.warn(
            `[Edge] Sync failed; measurements stay local and are retried: ${String(error)}`,
          );
          await db
            .update(edgeLink)
            .set({
              lastError: String(
                error instanceof Error ? error.message : error,
              ).slice(0, 500),
            })
            .where(eq(edgeLink.id, 1))
            .catch(() => {});
          return Math.min(
            config.EDGE_SYNC_INTERVAL_MS * 2 ** failures,
            MAX_BACKOFF_MS,
          );
        })
        .then((delay) => {
          pending = undefined;
          if (!stopped) timer = setTimeout(tick, delay);
        });
    };
    tick();
  },

  async stop() {
    stopped = true;
    clearTimeout(timer);
    await pending;
  },
};
