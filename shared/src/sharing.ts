import type { TrendingSeries } from "./domain-types.js";

export type SharedLinkStatus = "active" | "expired" | "revoked" | "legacy";

export interface SharedWidgetSelection {
  id: string;
  title: string;
  machineId: number;
  nodeKeys: string[];
}

/** Administrator view of a read-only link; token material is never returned after creation. */
export interface SharedLink {
  id: number;
  dashboardId: string;
  label: string | null;
  status: SharedLinkStatus;
  widgets: SharedWidgetSelection[];
  windowHours: number | null;
  allowEmbed: boolean;
  allowedOrigins: string[];
  expiresAt: string | null;
  createdBy: number | null;
  createdAt: string | null;
  revokedAt: string | null;
  revokedBy: number | null;
}

export interface CreateSharedLinkRequest {
  widgetIds: string[];
  label?: string;
  expiresAt: string;
  windowHours: number;
  allowEmbed: boolean;
  allowedOrigins: string[];
}

export interface CreateSharedLinkResponse {
  share: SharedLink;
  /** Shown once; only its SHA-256 digest is stored. */
  token: string;
}

export interface PublicSharedView {
  label: string | null;
  expiresAt: string;
  windowHours: number;
  refreshSeconds: number;
  widgets: Array<{
    id: string;
    title: string;
    machineName: string | null;
    signals: Array<{ key: string; displayName: string }>;
  }>;
}

export interface PublicSharedData {
  generatedAt: string;
  series: Array<Omit<TrendingSeries, "machineId">>;
}
