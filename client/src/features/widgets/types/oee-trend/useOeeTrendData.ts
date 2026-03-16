import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';
import { useTimeRangeStore } from '@/stores/useTimeRangeStore';

export type Granularity = 'hour' | 'day' | 'week';

export interface OeeTrendPoint {
  timestamp: string;
  oee: number;
  availability: number;
  performance: number;
  quality: number;
}

/**
 *
 * @param machineId
 * @param granularity
 */
export function useOeeTrendData(machineId: number | null, granularity: Granularity = 'day') {
  const timeRange = useTimeRangeStore((s) => s.timeRange);

  return useQuery({
    queryKey: [
      'oee-trend',
      machineId,
      granularity,
      timeRange.start?.toISOString(),
      timeRange.end?.toISOString(),
    ],
    queryFn: async (): Promise<OeeTrendPoint[]> => {
      if (!machineId) throw new Error('No machine selected');
      const params = new URLSearchParams({ granularity });
      if (timeRange.start) params.set('startDate', timeRange.start.toISOString());
      if (timeRange.end) params.set('endDate', timeRange.end.toISOString());
      const res = await protectedFetch(`${API_ENDPOINTS.oee.history(machineId)}?${params}`);
      if (!res.ok) throw new Error('Failed to fetch OEE trend data');
      return res.json();
    },
    enabled: !!machineId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
