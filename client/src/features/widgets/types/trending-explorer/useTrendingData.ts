import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';

export interface TrendingDataParams {
  nodeKeys: string[];
  machineId?: number;
  startDate: string;
  endDate: string;
}

export interface TrendingSeries {
  id: string;
  data: Array<{ x: string; y: number }>;
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
      return res.json();
    },
    enabled: params.nodeKeys.length > 0,
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
