import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BatchParameterValue {
  name: string;
  unit: string;
  setpoint: number;
  currentValue: number;
  min: number;
  max: number;
}

export interface Batch {
  id: number;
  batchNumber: string;
  recipeId: number;
  recipeName: string;
  recipeVersion: number;
  machineId: number;
  machineName?: string;
  status: 'pending' | 'running' | 'completed' | 'aborted';
  startedAt: string | null;
  completedAt: string | null;
  abortedAt: string | null;
  abortReason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface BatchData {
  batchId: number;
  parameters: BatchParameterValue[];
  dataPoints: Array<{
    timestamp: string;
    values: Record<string, number>;
  }>;
}

export interface CreateBatchRequest {
  recipeId: number;
  machineId: number;
  batchNumber?: string;
}

export interface BatchFilters {
  recipeId?: number;
  machineId?: number;
  status?: string;
  search?: string;
}

export interface CompareBatchesRequest {
  batchIds: number[];
}

export interface BatchComparison {
  batches: Batch[];
  parameterComparison: Array<{
    name: string;
    values: Record<number, { avg: number; min: number; max: number }>;
  }>;
}

// ── Query Keys ─────────────────────────────────────────────────────────────

const batchKeys = {
  all: ['batches'] as const,
  list: (filters: BatchFilters) => [...batchKeys.all, 'list', filters] as const,
  detail: (id: number) => [...batchKeys.all, 'detail', id] as const,
  data: (id: number) => [...batchKeys.all, 'data', id] as const,
  active: (machineId?: number) => [...batchKeys.all, 'active', machineId] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 *
 * @param filters
 */
function buildBatchParams(filters: BatchFilters): string {
  const params = new URLSearchParams();
  if (filters.recipeId) params.set('recipeId', String(filters.recipeId));
  if (filters.machineId) params.set('machineId', String(filters.machineId));
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 *
 * @param filters
 */
export function useBatches(filters: BatchFilters = {}) {
  return useQuery({
    queryKey: batchKeys.list(filters),
    queryFn: () =>
      api.get(`${API_ENDPOINTS.batches.base}${buildBatchParams(filters)}`) as Promise<Batch[]>,
  });
}

/**
 *
 * @param id
 */
export function useBatch(id: number) {
  return useQuery({
    queryKey: batchKeys.detail(id),
    queryFn: () => api.get(API_ENDPOINTS.batches.byId(id)) as Promise<Batch>,
    enabled: id > 0,
  });
}

/**
 *
 */
export function useCreateBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBatchRequest) =>
      api.post(API_ENDPOINTS.batches.base, data) as Promise<Batch>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchKeys.all });
    },
  });
}

/**
 *
 */
export function useStartBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(API_ENDPOINTS.batches.start(id)) as Promise<Batch>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchKeys.all });
    },
  });
}

/**
 *
 */
export function useCompleteBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(API_ENDPOINTS.batches.complete(id)) as Promise<Batch>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchKeys.all });
    },
  });
}

/**
 *
 */
export function useAbortBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api.post(API_ENDPOINTS.batches.abort(id), { reason }) as Promise<Batch>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchKeys.all });
    },
  });
}

/**
 *
 * @param id
 */
export function useBatchData(id: number) {
  return useQuery({
    queryKey: batchKeys.data(id),
    queryFn: () => api.get(API_ENDPOINTS.batches.data(id)) as Promise<BatchData>,
    enabled: id > 0,
  });
}

/**
 *
 */
export function useCompareBatches() {
  return useMutation({
    mutationFn: (data: CompareBatchesRequest) =>
      api.post(API_ENDPOINTS.batches.compare, data) as Promise<BatchComparison>,
  });
}

/**
 *
 * @param machineId
 */
export function useActiveBatch(machineId?: number) {
  return useQuery({
    queryKey: batchKeys.active(machineId),
    queryFn: () => {
      const url = machineId
        ? `${API_ENDPOINTS.batches.active}?machineId=${machineId}`
        : API_ENDPOINTS.batches.active;
      return api.get(url) as Promise<Batch | null>;
    },
    refetchInterval: 10000,
  });
}
