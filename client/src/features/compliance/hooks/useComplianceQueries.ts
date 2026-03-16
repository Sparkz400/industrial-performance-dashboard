import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ComplianceLogEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  userId: number;
  username: string;
  reason: string | null;
  signature: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ComplianceLogFilters {
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface IntegrityCheckResult {
  valid: boolean;
  totalRecords: number;
  invalidRecords: number;
  details: Array<{ id: number; reason: string }>;
  checkedAt: string;
}

export interface VerifySignatureRequest {
  logId: number;
  password: string;
}

export interface VerifySignatureResult {
  valid: boolean;
  message: string;
}

export interface DashboardVersion {
  version: number;
  dashboardId: string;
  description: string;
  createdBy: string;
  createdAt: string;
  data: Record<string, unknown>;
}

export interface DashboardDiff {
  versionA: number;
  versionB: number;
  changes: Array<{
    path: string;
    type: 'added' | 'removed' | 'modified';
    oldValue?: unknown;
    newValue?: unknown;
  }>;
}

// ── Query Keys ─────────────────────────────────────────────────────────────

const complianceKeys = {
  all: ['compliance'] as const,
  logs: (filters: ComplianceLogFilters) => [...complianceKeys.all, 'logs', filters] as const,
  integrityCheck: () => [...complianceKeys.all, 'integrity-check'] as const,
  dashboardVersions: (dashboardId: string) =>
    [...complianceKeys.all, 'dashboard-versions', dashboardId] as const,
  dashboardDiff: (dashboardId: string, versionA: number, versionB: number) =>
    [...complianceKeys.all, 'dashboard-diff', dashboardId, versionA, versionB] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 *
 * @param filters
 */
function buildComplianceParams(filters: ComplianceLogFilters): string {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.search) params.set('search', filters.search);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 *
 * @param filters
 */
export function useComplianceLogs(filters: ComplianceLogFilters = {}) {
  return useQuery({
    queryKey: complianceKeys.logs(filters),
    queryFn: () =>
      api.get(`${API_ENDPOINTS.compliance.logs}${buildComplianceParams(filters)}`) as Promise<{
        logs: ComplianceLogEntry[];
        total: number;
      }>,
  });
}

/**
 *
 */
export function useVerifySignature() {
  return useMutation({
    mutationFn: (data: VerifySignatureRequest) =>
      api.post(API_ENDPOINTS.compliance.verifySignature, data) as Promise<VerifySignatureResult>,
  });
}

/**
 *
 */
export function useIntegrityCheck() {
  return useQuery({
    queryKey: complianceKeys.integrityCheck(),
    queryFn: () =>
      api.get(API_ENDPOINTS.compliance.integrityCheck) as Promise<IntegrityCheckResult>,
    enabled: false, // Only run on demand via refetch
  });
}

/**
 *
 * @param dashboardId
 */
export function useDashboardVersions(dashboardId: string) {
  return useQuery({
    queryKey: complianceKeys.dashboardVersions(dashboardId),
    queryFn: () =>
      api.get(API_ENDPOINTS.compliance.dashboardVersions(dashboardId)) as Promise<
        DashboardVersion[]
      >,
    enabled: !!dashboardId,
  });
}

/**
 *
 * @param dashboardId
 * @param versionA
 * @param versionB
 */
export function useDashboardDiff(dashboardId: string, versionA: number, versionB: number) {
  return useQuery({
    queryKey: complianceKeys.dashboardDiff(dashboardId, versionA, versionB),
    queryFn: () =>
      api.get(
        `${API_ENDPOINTS.compliance.dashboardDiff(dashboardId)}?versionA=${versionA}&versionB=${versionB}`,
      ) as Promise<DashboardDiff>,
    enabled: !!dashboardId && versionA > 0 && versionB > 0,
  });
}

/**
 *
 */
export function useRestoreVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, version }: { dashboardId: string; version: number }) =>
      api.post(API_ENDPOINTS.compliance.restoreVersion(dashboardId, version)) as Promise<{
        message: string;
      }>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: complianceKeys.dashboardVersions(variables.dashboardId),
      });
    },
  });
}
