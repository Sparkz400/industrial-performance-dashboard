import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';
import type { SpcProfile, SpcAlert, SpcChartData } from '@performance-dashboard/shared';

// Re-export shared types for convenience
export type { SpcProfile, SpcAlert, SpcChartData };

// ── Local-only types ────────────────────────────────────────────────────────

export interface CreateSpcProfileRequest {
  name: string;
  machineId: number | null;
  nodeKey: string;
  method: 'zscore' | 'moving_avg' | 'std_bands' | 'cusum';
  sensitivity: number;
  windowSize?: number;
  chartType?: 'individuals' | 'xbar-r' | null;
  subgroupSize?: number | null;
}

export interface ControlChart {
  chartType: 'individuals' | 'xbar-r';
  subgroupSize: number | null;
  baseline: { id: number; referencePoints: number };
  primary: { label: string; center: number; ucl: number; lcl: number };
  secondary: { label: string; center: number; ucl: number; lcl: number };
  points: { at: string; value: number; range: number | null; outOfControl: boolean }[];
  truncated: boolean;
  assumptions: string;
  specificationLimits: string;
}

/**
 * The declared control chart; errors explain a missing declaration or reference period.
 * @param profileId
 * @param startDate
 * @param endDate
 */
export function useSpcControlChart(profileId: number, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['spc', 'control-chart', profileId, startDate, endDate],
    queryFn: () =>
      api.get(
        `${API_ENDPOINTS.spc.controlChart(profileId)}?${new URLSearchParams({
          startDate: startDate ?? '',
          endDate: endDate ?? '',
        })}`,
      ) as Promise<ControlChart>,
    enabled: profileId > 0 && !!startDate && !!endDate,
    retry: false,
  });
}

export interface SpcAlertFilters {
  profileId?: number;
  machineId?: number;
  acknowledged?: boolean;
}

// ── Query Keys ─────────────────────────────────────────────────────────────

const spcKeys = {
  all: ['spc'] as const,
  profiles: (machineId?: number) => [...spcKeys.all, 'profiles', machineId] as const,
  profile: (id: number) => [...spcKeys.all, 'profile', id] as const,
  chartData: (profileId: number, startDate?: string, endDate?: string) =>
    [...spcKeys.all, 'chart-data', profileId, startDate, endDate] as const,
  alerts: (filters: SpcAlertFilters) => [...spcKeys.all, 'alerts', filters] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 *
 * @param machineId
 */
export function useSpcProfiles(machineId?: number) {
  return useQuery({
    queryKey: spcKeys.profiles(machineId),
    queryFn: () => {
      const url = machineId
        ? `${API_ENDPOINTS.spc.profiles}?machineId=${machineId}`
        : API_ENDPOINTS.spc.profiles;
      return api.get(url) as Promise<SpcProfile[]>;
    },
  });
}

/**
 *
 * @param id
 */
export function useSpcProfile(id: number) {
  return useQuery({
    queryKey: spcKeys.profile(id),
    queryFn: () => api.get(API_ENDPOINTS.spc.profileById(id)) as Promise<SpcProfile>,
    enabled: id > 0,
  });
}

/**
 *
 */
export function useCreateSpcProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSpcProfileRequest) =>
      api.post(API_ENDPOINTS.spc.profiles, data) as Promise<SpcProfile>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spcKeys.profiles() });
    },
  });
}

/**
 *
 */
export function useUpdateSpcProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CreateSpcProfileRequest> & { id: number }) =>
      api.put(API_ENDPOINTS.spc.profileById(id), data) as Promise<SpcProfile>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: spcKeys.profiles() });
      queryClient.invalidateQueries({ queryKey: spcKeys.profile(variables.id) });
    },
  });
}

/**
 *
 */
export function useDeleteSpcProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(API_ENDPOINTS.spc.profileById(id)) as Promise<{ message: string }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spcKeys.profiles() });
    },
  });
}

/**
 *
 */
export function useComputeBaseline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post(API_ENDPOINTS.spc.computeBaseline(id), {}) as Promise<{
        id: number;
        status: 'pending-review';
      }>,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['baselines'] });
      queryClient.invalidateQueries({ queryKey: spcKeys.profile(id) });
      queryClient.invalidateQueries({ queryKey: spcKeys.profiles() });
    },
  });
}

/**
 *
 * @param profileId
 * @param startDate
 * @param endDate
 */
export function useSpcChartData(profileId: number, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: spcKeys.chartData(profileId, startDate, endDate),
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString();
      const url = `${API_ENDPOINTS.spc.chartData(profileId)}${qs ? `?${qs}` : ''}`;
      return api.get(url) as Promise<SpcChartData>;
    },
    enabled: profileId > 0,
    refetchInterval: 30000,
  });
}

/**
 *
 * @param filters
 */
export function useSpcAlerts(filters: SpcAlertFilters = {}) {
  return useQuery({
    queryKey: spcKeys.alerts(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.profileId) params.set('profileId', String(filters.profileId));
      if (filters.machineId) params.set('machineId', String(filters.machineId));
      if (filters.acknowledged !== undefined)
        params.set('acknowledged', String(filters.acknowledged));
      const qs = params.toString();
      return api.get(`${API_ENDPOINTS.spc.alerts}${qs ? `?${qs}` : ''}`) as Promise<SpcAlert[]>;
    },
  });
}

/**
 *
 */
export function useAcknowledgeSpcAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post(API_ENDPOINTS.spc.acknowledgeAlert(id)) as Promise<{ message: string }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...spcKeys.all, 'alerts'] });
    },
  });
}
