import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';
import type {
  GetTrendingDataResponse,
  TrendingSeries as ApiTrendingSeries,
} from '@performance-dashboard/shared';

export interface TrendingDataParams {
  nodeKeys: string[];
  machineId?: number;
  startDate: string;
  endDate: string;
}

export interface TrendingSeries extends Omit<ApiTrendingSeries, 'data'> {
  id: string;
  data: Array<{
    x: string;
    y: number | null;
    statusCode?: string | null;
    sourceTimestamp?: string | null;
    receivedAt?: string | null;
  }>;
}

/**
 *
 * @param response
 */
export function toChartSeries(response: GetTrendingDataResponse): TrendingSeries[] {
  return response.series.map((series) => ({
    ...series,
    id: `${series.displayName} [${series.nodeKey}]`,
    data: series.data.map((point) => ({ ...point, x: point.timestamp, y: point.value })),
  }));
}

export interface AvailableTag {
  nodeKey: string;
  displayName: string;
  dataType: string;
}

/**
 *
 * @param params
 */
export function useTrendingData(params: TrendingDataParams) {
  return useQuery({
    queryKey: ['trending', params],
    queryFn: async (): Promise<TrendingSeries[]> => {
      const searchParams = new URLSearchParams({
        nodeKeys: params.nodeKeys.join(','),
        startDate: params.startDate,
        endDate: params.endDate,
      });
      if (params.machineId) searchParams.set('machineId', String(params.machineId));
      const res = await protectedFetch(`${API_ENDPOINTS.trending.data}?${searchParams}`);
      if (!res.ok) throw new Error('Failed to fetch trending data');
      const payload: GetTrendingDataResponse = await res.json();
      return toChartSeries(payload);
    },
    enabled:
      params.nodeKeys.length > 0 && !!params.machineId && !!params.startDate && !!params.endDate,
    staleTime: 15_000,
  });
}

/**
 *
 * @param machineId
 */
export function useAvailableTags(machineId: number | null) {
  return useQuery({
    queryKey: ['trending-tags', machineId],
    queryFn: async (): Promise<AvailableTag[]> => {
      if (!machineId) return [];
      const res = await protectedFetch(API_ENDPOINTS.trending.availableTags(machineId));
      if (!res.ok) throw new Error('Failed to fetch tags');
      return res.json();
    },
    enabled: !!machineId,
    staleTime: 60_000,
  });
}
