import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';
import { useTimeRangeStore } from '@/stores/useTimeRangeStore';

export interface OeeData {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  dataComplete: boolean;
  evidence?: OeeResponse;
}

export interface OeeResponse {
  oee: number;
  availability: { availability: number; unknownTimeMinutes?: number; totalTimeMinutes?: number };
  performance: { performance: number; dataComplete?: boolean; totalCount?: number };
  quality: { quality: number; dataComplete?: boolean; goodCount?: number; rejectCount?: number };
  startDate?: string;
  endDate?: string;
  dataComplete: boolean;
}

/**
 * Convert API ratios and nested metrics into display percentages.
 * @param result Measured OEE response.
 */
export function toOeeDisplay(result: OeeResponse): OeeData {
  return {
    oee: result.oee * 100,
    availability: result.availability.availability * 100,
    performance: result.performance.performance * 100,
    quality: result.quality.quality * 100,
    dataComplete: result.dataComplete,
    evidence: result,
  };
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
      return toOeeDisplay(await res.json());
    },
    enabled: !!machineId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
