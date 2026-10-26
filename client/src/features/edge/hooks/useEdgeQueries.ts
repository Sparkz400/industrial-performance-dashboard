import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface EdgeStatus {
  centralHistory?: 'unavailable';
  legacyTransferredRecords?: number;
  enabled: boolean;
  cloudConnected: boolean;
  lastSyncAt: string | null;
  syncQueueDepth: number;
  pendingRecords: number;
  uptime: number;
  version: string;
}

export interface EdgeConfig {
  enabled: boolean;
  cloudUrl: string;
  syncIntervalSeconds: number;
  batchSize: number;
  retentionDays: number;
}

export interface UpdateEdgeConfigRequest {
  cloudUrl?: string;
  syncIntervalSeconds?: number;
  batchSize?: number;
  retentionDays?: number;
  enabled?: boolean;
}

// ── Query Keys ─────────────────────────────────────────────────────────────

const edgeKeys = {
  all: ['edge'] as const,
  status: () => [...edgeKeys.all, 'status'] as const,
  config: () => [...edgeKeys.all, 'config'] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 *
 */
export function useEdgeStatus() {
  return useQuery({
    queryKey: edgeKeys.status(),
    queryFn: () => api.get(API_ENDPOINTS.edge.status) as Promise<EdgeStatus>,
    refetchInterval: 30000,
  });
}

/**
 *
 */
export function useEdgeConfig() {
  return useQuery({
    queryKey: edgeKeys.config(),
    queryFn: () => api.get(API_ENDPOINTS.edge.config) as Promise<EdgeConfig>,
  });
}

/**
 *
 */
export function useUpdateEdgeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateEdgeConfigRequest) =>
      api.put(API_ENDPOINTS.edge.config, data) as Promise<EdgeConfig>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeKeys.config() });
    },
  });
}

/**
 *
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(API_ENDPOINTS.edge.triggerSync) as Promise<{ message: string }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeKeys.status() });
    },
  });
}
