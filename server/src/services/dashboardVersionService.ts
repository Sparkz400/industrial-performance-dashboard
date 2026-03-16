import { dashboardVersionRepository } from "../repositories/dashboardVersionRepository.js";
import { dashboardRepository } from "../repositories/dashboardRepository.js";
import { NotFoundError } from "../utils/errors.js";
import logger from "../utils/logger.js";

export interface VersionDiff {
  versionA: number;
  versionB: number;
  widgetsAdded: unknown[];
  widgetsRemoved: unknown[];
  widgetsModified: unknown[];
  layoutChanges: { before: unknown; after: unknown } | null;
}

export const dashboardVersionService = {
  async createVersionSnapshot(
    dashboardId: string,
    dashboard: { name: string; widgets: unknown; layout: unknown },
    userId: number | null,
    changeDescription?: string,
  ) {
    const latestVersion =
      await dashboardVersionRepository.getLatestVersionNumber(dashboardId);
    const nextVersion = latestVersion + 1;

    const version = await dashboardVersionRepository.createVersion({
      dashboardId,
      version: nextVersion,
      name: dashboard.name,
      widgets: dashboard.widgets,
      layout: dashboard.layout,
      changeDescription: changeDescription ?? null,
      createdBy: userId,
    });

    logger.info(
      `[DashboardVersion] Created version ${nextVersion} for dashboard "${dashboardId}"`,
    );

    return version;
  },

  async listVersions(dashboardId: string) {
    return dashboardVersionRepository.listVersions(dashboardId);
  },

  async getVersionDiff(
    dashboardId: string,
    versionA: number,
    versionB: number,
  ): Promise<VersionDiff> {
    const [verA, verB] = await Promise.all([
      dashboardVersionRepository.getVersion(dashboardId, versionA),
      dashboardVersionRepository.getVersion(dashboardId, versionB),
    ]);

    if (!verA) {
      throw new NotFoundError(`Dashboard version ${versionA}`);
    }
    if (!verB) {
      throw new NotFoundError(`Dashboard version ${versionB}`);
    }

    const widgetsA = Array.isArray(verA.widgets) ? verA.widgets : [];
    const widgetsB = Array.isArray(verB.widgets) ? verB.widgets : [];

    // Build maps keyed by widget id for comparison
    const mapA = new Map<string, Record<string, unknown>>();
    const mapB = new Map<string, Record<string, unknown>>();

    for (const w of widgetsA) {
      const widget = w as Record<string, unknown>;
      if (widget.id) mapA.set(String(widget.id), widget);
    }

    for (const w of widgetsB) {
      const widget = w as Record<string, unknown>;
      if (widget.id) mapB.set(String(widget.id), widget);
    }

    const widgetsAdded: unknown[] = [];
    const widgetsRemoved: unknown[] = [];
    const widgetsModified: unknown[] = [];

    // Widgets in B but not in A => added
    for (const [id, widget] of mapB) {
      if (!mapA.has(id)) {
        widgetsAdded.push(widget);
      }
    }

    // Widgets in A but not in B => removed
    for (const [id, widget] of mapA) {
      if (!mapB.has(id)) {
        widgetsRemoved.push(widget);
      }
    }

    // Widgets in both but changed => modified
    for (const [id, widgetA] of mapA) {
      const widgetB = mapB.get(id);
      if (widgetB && JSON.stringify(widgetA) !== JSON.stringify(widgetB)) {
        widgetsModified.push({ id, before: widgetA, after: widgetB });
      }
    }

    // Layout changes
    const layoutA = verA.layout;
    const layoutB = verB.layout;
    const layoutChanged = JSON.stringify(layoutA) !== JSON.stringify(layoutB);

    return {
      versionA,
      versionB,
      widgetsAdded,
      widgetsRemoved,
      widgetsModified,
      layoutChanges: layoutChanged ? { before: layoutA, after: layoutB } : null,
    };
  },

  async restoreVersion(
    dashboardId: string,
    version: number,
    userId: number | null,
  ) {
    const ver = await dashboardVersionRepository.getVersion(
      dashboardId,
      version,
    );
    if (!ver) {
      throw new NotFoundError(`Dashboard version ${version}`);
    }

    const restored = await dashboardRepository.saveWithHistory({
      id: dashboardId,
      name: ver.name,
      widgets: ver.widgets as any,
      layout: ver.layout as any,
    });

    logger.info(
      `[DashboardVersion] Restored dashboard "${dashboardId}" to version ${version} by user ${userId}`,
    );

    return restored;
  },
};
