import { useQuery } from '@tanstack/react-query';
import { operationRequest } from '@/features/operations/api';
export interface WidgetEvidence {
  machineId: number;
  profileId: number;
  profileName: string;
  start: string;
  end: string;
  timezone: string;
  meaning: string;
  days: {
    start: string;
    end: string;
    seconds: Record<string, number>;
    uptimePercent: number | null;
    coveragePercent: number;
    corrected: number;
  }[];
}
/**
 * Load observed state durations and explicit unknown coverage.
 * @param machineId Selected machine.
 */
export function useWidgetEvidence(machineId?: number) {
  return useQuery({
    queryKey: ['widget-evidence', machineId],
    queryFn: () => operationRequest<WidgetEvidence>(`/widget-evidence/machines/${machineId}`),
    enabled: Number.isInteger(machineId) && Number(machineId) > 0,
    refetchInterval: 60000,
  });
}
