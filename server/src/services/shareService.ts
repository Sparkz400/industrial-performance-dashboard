import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import db from "../database/db.js";
import type {
  CreateSharedLinkRequest,
  PublicSharedData,
  PublicSharedView,
  SharedLink,
  SharedWidgetSelection,
} from "@performance-dashboard/shared";
import {
  dashboards,
  machines,
  nodeMappings,
  shareTokens,
  users,
} from "../database/schema.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { trendingDataService } from "./trendingDataService.js";

export const SHARE_LIMITS = {
  maxLifetimeDays: 30,
  maxWindowHours: 168,
  maxWidgets: 12,
  maxOrigins: 5,
} as const;

type ShareRow = typeof shareTokens.$inferSelect;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const hashShareToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Exact scheme://host[:port] origins only; wildcards and paths would widen embedding. */
export function normalizeOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError(`Invalid embedding origin: ${value}`);
  }
  // WHATWG URLs accept "*" in hosts, which CSP would read as a wildcard.
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.origin !== value ||
    !/^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])$/i.test(url.hostname)
  )
    throw new ValidationError(
      `Embedding origins must be exact origins such as https://intranet.example: ${value}`,
    );
  return url.origin;
}

export function selectWidgets(
  widgets: unknown,
  widgetIds: string[],
): SharedWidgetSelection[] {
  const ids = [...new Set(widgetIds)];
  if (!ids.length || ids.length > SHARE_LIMITS.maxWidgets)
    throw new ValidationError(
      `Select between 1 and ${SHARE_LIMITS.maxWidgets} trend widgets`,
    );
  const list = Array.isArray(widgets) ? widgets : [];
  return ids.map((id) => {
    const widget = list.find((item) => item?.id === id);
    if (!widget) throw new ValidationError(`Unknown widget: ${id}`);
    const config = widget.config ?? {};
    const keys: unknown = config.defaultTags;
    if (
      widget.type !== "trendingExplorer" ||
      !Number.isSafeInteger(config.machineId) ||
      config.machineId <= 0 ||
      !Array.isArray(keys) ||
      !keys.length ||
      keys.length > 32 ||
      keys.some((key) => typeof key !== "string" || !key.trim())
    )
      throw new ValidationError(
        `Only trend widgets with one machine and 1-32 signals can be shared: ${id}`,
      );
    return {
      id,
      title: String(config.title || widget.title || "Trend").slice(0, 120),
      machineId: config.machineId,
      nodeKeys: [...new Set(keys as string[])],
    };
  });
}

function status(row: ShareRow, now = new Date()): SharedLink["status"] {
  if (!row.tokenHash || !row.selection) return "legacy";
  if (row.revokedAt || !row.isActive) return "revoked";
  if (!row.expiresAt || row.expiresAt <= now) return "expired";
  return "active";
}

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Administrative listing never returns token material. */
function describe(row: ShareRow): SharedLink {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    label: row.label,
    status: status(row),
    widgets: row.selection ?? [],
    windowHours: row.windowHours,
    allowEmbed: row.allowEmbed,
    allowedOrigins: row.allowedOrigins,
    expiresAt: iso(row.expiresAt),
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    revokedAt: iso(row.revokedAt),
    revokedBy: row.revokedBy,
  };
}

export const shareService = {
  async getSharesForDashboard(dashboardId: string) {
    const rows = await db
      .select()
      .from(shareTokens)
      .where(eq(shareTokens.dashboardId, dashboardId));
    return rows.map(describe);
  },

  async createShare(
    dashboardId: string,
    input: CreateSharedLinkRequest,
    actorId: number,
  ) {
    const [dashboard] = await db
      .select({ widgets: dashboards.widgets })
      .from(dashboards)
      .where(eq(dashboards.id, dashboardId));
    if (!dashboard) throw new NotFoundError("Dashboard");
    const selection = selectWidgets(dashboard.widgets, input.widgetIds);
    const machineIds = [...new Set(selection.map((item) => item.machineId))];
    const found = await db
      .select({ id: machines.id })
      .from(machines)
      .where(inArray(machines.id, machineIds));
    if (found.length !== machineIds.length)
      throw new ValidationError(
        "A selected widget refers to an unknown machine",
      );
    const expiresAt = new Date(input.expiresAt);
    const now = Date.now();
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= now + 60_000 ||
      expiresAt.getTime() > now + SHARE_LIMITS.maxLifetimeDays * 86_400_000
    )
      throw new ValidationError(
        `Expiry must be between one minute and ${SHARE_LIMITS.maxLifetimeDays} days from now`,
      );
    if (
      !Number.isInteger(input.windowHours) ||
      input.windowHours < 1 ||
      input.windowHours > SHARE_LIMITS.maxWindowHours
    )
      throw new ValidationError(
        `The visible window must be 1-${SHARE_LIMITS.maxWindowHours} hours`,
      );
    const allowedOrigins = [
      ...new Set(input.allowedOrigins.map(normalizeOrigin)),
    ];
    if (input.allowEmbed !== allowedOrigins.length > 0)
      throw new ValidationError(
        "Embedding requires at least one allowed origin; links without embedding must not list origins",
      );
    if (allowedOrigins.length > SHARE_LIMITS.maxOrigins)
      throw new ValidationError(
        `List at most ${SHARE_LIMITS.maxOrigins} embedding origins`,
      );
    const token = randomBytes(32).toString("base64url");
    const [row] = await db
      .insert(shareTokens)
      .values({
        dashboardId,
        tokenHash: hashShareToken(token),
        label: input.label?.trim().slice(0, 120) || null,
        selection,
        windowHours: input.windowHours,
        allowEmbed: input.allowEmbed,
        allowedOrigins,
        expiresAt,
        createdBy: actorId,
      })
      .returning();
    return { share: describe(row), token };
  },

  async revokeShare(id: number, actorId: number) {
    const rows = await db
      .update(shareTokens)
      .set({ isActive: false, revokedAt: new Date(), revokedBy: actorId })
      .where(and(eq(shareTokens.id, id), isNull(shareTokens.revokedAt)))
      .returning();
    if (rows.length) return describe(rows[0]);
    const [existing] = await db
      .select()
      .from(shareTokens)
      .where(eq(shareTokens.id, id));
    if (!existing) throw new NotFoundError("Share token");
    return describe(existing);
  },

  /** Every public read re-checks expiry, revocation and the creator's current authority. */
  async resolve(token: string) {
    if (!TOKEN_PATTERN.test(token)) return null;
    const [row] = await db
      .select({ share: shareTokens })
      .from(shareTokens)
      .innerJoin(users, eq(users.id, shareTokens.createdBy))
      .where(
        and(
          eq(shareTokens.tokenHash, hashShareToken(token)),
          eq(shareTokens.isActive, true),
          isNull(shareTokens.revokedAt),
          isNotNull(shareTokens.selection),
          gt(shareTokens.expiresAt, new Date()),
          eq(users.isActive, true),
          eq(users.role, "admin"),
        ),
      );
    return row?.share ?? null;
  },

  async publicView(share: ShareRow): Promise<PublicSharedView> {
    const selection = share.selection ?? [];
    const machineIds = [...new Set(selection.map((item) => item.machineId))];
    const names = new Map(
      (
        await db
          .select({ id: machines.id, name: machines.name })
          .from(machines)
          .where(inArray(machines.id, machineIds))
      ).map((row) => [row.id, row.name]),
    );
    const mappings = await db
      .select({
        machineId: nodeMappings.machineId,
        nodeKey: nodeMappings.nodeKey,
        displayName: nodeMappings.displayName,
      })
      .from(nodeMappings)
      .where(inArray(nodeMappings.machineId, machineIds));
    const label = (machineId: number, key: string) =>
      mappings.find((row) => row.machineId === machineId && row.nodeKey === key)
        ?.displayName ?? key;
    return {
      label: share.label,
      expiresAt: share.expiresAt!.toISOString(),
      windowHours: share.windowHours!,
      refreshSeconds: 15,
      widgets: selection.map((item) => ({
        id: item.id,
        title: item.title,
        machineName: names.get(item.machineId) ?? null,
        signals: item.nodeKeys.map((key) => ({
          key,
          displayName: label(item.machineId, key),
        })),
      })),
    };
  },

  async publicData(
    share: ShareRow,
    widgetId: string,
  ): Promise<PublicSharedData> {
    const item = share.selection?.find((entry) => entry.id === widgetId);
    if (!item) throw new NotFoundError("Shared widget");
    const endDate = new Date();
    const startDate = new Date(
      endDate.getTime() - (share.windowHours ?? 1) * 3_600_000,
    );
    const result = await trendingDataService.queryTrendingData({
      machineId: item.machineId,
      nodeKeys: item.nodeKeys,
      startDate,
      endDate,
    });
    // Internal identifiers are not part of the shared view.
    return {
      generatedAt: endDate.toISOString(),
      series: result.series.map(
        ({ machineId: _machineId, ...series }) => series,
      ),
    };
  },
};
