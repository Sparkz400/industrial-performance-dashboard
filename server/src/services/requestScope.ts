import { AsyncLocalStorage } from "node:async_hooks";
import type { UserRole } from "@performance-dashboard/shared";

export interface AccessScope {
  userId: number;
  role: UserRole;
  machineIds: number[];
  dashboardIds: string[];
}

export const accessScope = new AsyncLocalStorage<AccessScope>();
