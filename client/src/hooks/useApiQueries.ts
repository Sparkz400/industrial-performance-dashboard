import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { API_ENDPOINTS } from '../config/config';
import { useTimeRangeStore } from '../stores/useTimeRangeStore';
import type { Dashboard, SystemStatus } from '../types';

// ===== Dashboard Queries =====
export const useDashboardsQuery = () =>
  useQuery<Dashboard[]>({
    queryKey: ['dashboards'],
    queryFn: () => api.endpoints.getDashboards(),
    staleTime: 60 * 1000,
  });

export const useSaveDashboardMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dashboard: Dashboard) => api.endpoints.saveDashboard(dashboard),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
};

export const useDeleteDashboardMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.endpoints.deleteDashboard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
};

// ===== Status Queries =====
export const useStatusQuery = () =>
  useQuery<SystemStatus>({
    queryKey: ['systemStatus'],
    queryFn: () => api.endpoints.getStatus(),
    refetchInterval: 20000,
  });

// ===== Operation Mode Data =====
export const useOperationModeQuery = () => {
  const timeRange = useTimeRangeStore((s) => s.timeRange);
  const lastRefresh = useTimeRangeStore((s) => s.lastRefresh);

  return useQuery({
    queryKey: [
      'operationMode',
      timeRange.start.toISOString(),
      timeRange.end.toISOString(),
      lastRefresh.toISOString(),
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: timeRange.start.toISOString(),
        endDate: timeRange.end.toISOString(),
        limit: '5000',
      });
      const res = await fetch(`${API_ENDPOINTS.operationModeData}?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch operation mode data');
      return res.json();
    },
    staleTime: 15 * 1000,
  });
};

// ===== System Stats =====
export const useSystemStatsQuery = () =>
  useQuery({
    queryKey: ['systemStats'],
    queryFn: () => api.endpoints.getSystemStats(),
    refetchInterval: 30000,
  });
