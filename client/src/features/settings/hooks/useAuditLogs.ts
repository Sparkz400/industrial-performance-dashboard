import { useQuery } from '@tanstack/react-query';

import { api } from '@/utils/api';
import type { GetAuditLogsRequest, GetAuditLogsResponse } from '@/types';

export const useAuditLogs = (filters: GetAuditLogsRequest) =>
  useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => (await api.endpoints.getAuditLogs(filters)) as GetAuditLogsResponse,
    staleTime: 15 * 1000,
  });
