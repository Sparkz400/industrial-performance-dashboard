import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { API_ENDPOINTS } from '../config/config';
import { useTimeRangeStore } from '../stores/useTimeRangeStore';
import type { Dashboard, SystemStatus } from '../types';

// ===== Dashboard Queries =====
export const useDashboardsQuery = () =>
  useQuery<Dashboard[]>({
    queryKey: ['dashboards'],
    queryFn: () => api.endpoints.getDashboards() as Promise<Dashboard[]>,
    staleTime: 60 * 1000,
  });

export const useSaveDashboardMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dashboard: Dashboard) => api.endpoints.saveDashboard(dashboard),
    onMutate: async (dashboard) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['dashboards'] });

      // Snapshot previous value
      const previousDashboards = queryClient.getQueryData<Dashboard[]>(['dashboards']);

      // Optimistically update the cache
      queryClient.setQueryData<Dashboard[]>(['dashboards'], (old) => {
        if (!old) return [dashboard];
        const exists = old.some((d) => d.id === dashboard.id);
        if (exists) {
          return old.map((d) => (d.id === dashboard.id ? dashboard : d));
        }
        return [...old, dashboard];
      });

      return { previousDashboards };
    },
    onError: (_err, _dashboard, context) => {
      // Roll back to the previous value on error
      if (context?.previousDashboards) {
        queryClient.setQueryData(['dashboards'], context.previousDashboards);
      }
    },
    onSettled: () => {
      // Refetch to ensure server state is in sync
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
};

export const useDeleteDashboardMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.endpoints.deleteDashboard(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['dashboards'] });

      const previousDashboards = queryClient.getQueryData<Dashboard[]>(['dashboards']);

      // Optimistically remove from cache
      queryClient.setQueryData<Dashboard[]>(['dashboards'], (old) => {
        if (!old) return [];
        return old.filter((d) => d.id !== id);
      });

      return { previousDashboards };
    },
    onError: (_err, _id, context) => {
      if (context?.previousDashboards) {
        queryClient.setQueryData(['dashboards'], context.previousDashboards);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
};

// ===== Status Queries =====
export const useStatusQuery = () =>
  useQuery<SystemStatus>({
    queryKey: ['systemStatus'],
    queryFn: () => api.endpoints.getStatus() as Promise<SystemStatus>,
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
    queryFn: () => {
      const params = new URLSearchParams({
        startDate: timeRange.start.toISOString(),
        endDate: timeRange.end.toISOString(),
        limit: '5000',
      });
      return api.get(`${API_ENDPOINTS.operationModeData}?${params}`);
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
