import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';
import { useTimeRangeStore } from '@/stores/useTimeRangeStore';

export interface OeeData {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
}

/**
 *
 * @param machineId
 */
export function useOeeData(machineId: number | null) {
  const timeRange = useTimeRangeStore((s) => s.timeRange);

  return useQuery({
    queryKey: ['oee', machineId, timeRange.start?.toISOString(), timeRange.end?.toISOString()],
    queryFn: async (): Promise<OeeData> => {
      if (!machineId) throw new Error('No machine selected');
      const params = new URLSearchParams();
      if (timeRange.start) params.set('startDate', timeRange.start.toISOString());
      if (timeRange.end) params.set('endDate', timeRange.end.toISOString());
      const res = await protectedFetch(`${API_ENDPOINTS.oee.current(machineId)}?${params}`);
      if (!res.ok) throw new Error('Failed to fetch OEE');
      return res.json();
    },
    enabled: !!machineId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
