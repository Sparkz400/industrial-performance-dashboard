import { dashboardRepository } from "../repositories/dashboardRepository.js";
import { accessScope } from "./accessScope.js";
import logger from "../utils/logger.js";
import { NotFoundError, fromDatabaseError } from "../utils/errors.js";

export interface DashboardDraftInput {
  id: string;
  name: string;
  widgets?: unknown;
  layout?: unknown;
}

export interface DashboardImportInput {
  name: string;
  widgets?: unknown;
  layout?: unknown;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function isDatabaseError(error: unknown): error is { code?: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const dashboardService = {
  async listDashboards() {
    const readReplicaDashboards = await dashboardRepository.listFromReadDb();
    if (readReplicaDashboards.length > 0) {
      return readReplicaDashboards;
    }

    const primaryDashboards = await dashboardRepository.listFromPrimary();
    if (primaryDashboards.length > 0) {
      return primaryDashboards;
    }
    if (accessScope.getStore()?.role !== "admin" && accessScope.getStore())
      return [];

    logger.info(
      "No dashboards found on read replica or primary. Creating a default dashboard.",
    );

    const created = await dashboardRepository.create({
      id: `dashboard-default-${Date.now()}`,
      name: "Default Dashboard",
      widgets: [],
      layout: [],
    });

    return [created];
  },

  async importDashboard(input: DashboardImportInput) {
    return dashboardRepository.create({
      id: `dashboard-imported-${Date.now()}`,
      name: input.name.trim(),
      widgets: toArray(input.widgets),
      layout: toArray(input.layout),
    });
  },

  async getDashboardById(id: string) {
    const readReplicaDashboard =
      await dashboardRepository.findByIdFromReadDb(id);
    if (readReplicaDashboard) {
      return readReplicaDashboard;
    }

    const primaryDashboard = await dashboardRepository.findById(id);
    if (!primaryDashboard) {
      throw new NotFoundError("Dashboard");
    }

    return primaryDashboard;
  },

  async saveDashboard(input: DashboardDraftInput) {
    try {
      return await dashboardRepository.saveWithHistory(
        {
          id: input.id,
          name: input.name.trim(),
          widgets: toArray(input.widgets),
          layout: toArray(input.layout),
        },
        (error) => {
          logger.warn(`Error updating history: ${getErrorMessage(error)}`);
        },
      );
    } catch (error) {
      if (
        isDatabaseError(error) &&
        (error.code === "23505" || error.code === "42P01")
      ) {
        throw fromDatabaseError(error);
      }

      throw error;
    }
  },

  async deleteDashboard(id: string) {
    await dashboardRepository.deleteById(id);
  },
};
