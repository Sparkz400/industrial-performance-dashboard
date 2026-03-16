import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TwinElementDefinition {
  id: string;
  name: string;
  type: 'sensor' | 'actuator' | 'indicator' | 'zone';
  svgElementId: string;
  unit?: string;
}

export interface TwinTemplate {
  id: number;
  name: string;
  description: string;
  svgContent: string;
  elements: TwinElementDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface TwinNodeBinding {
  elementId: string;
  nodeKey: string;
  label: string;
  unit?: string;
  format?: string;
}

export interface TwinInstance {
  id: number;
  name: string;
  templateId: number;
  templateName: string;
  machineId: number;
  machineName?: string;
  bindings: TwinNodeBinding[];
  svgContent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTwinTemplateRequest {
  name: string;
  description?: string;
  svgContent: string;
  elements: TwinElementDefinition[];
}

export interface CreateTwinInstanceRequest {
  name: string;
  templateId: number;
  machineId: number;
  bindings: TwinNodeBinding[];
}

export interface UpdateTwinInstanceRequest {
  name?: string;
  bindings?: TwinNodeBinding[];
}

export interface ElementHistoryPoint {
  timestamp: string;
  value: number;
}

export interface ElementHistoryFilters {
  elementId: string;
  startDate?: string;
  endDate?: string;
}

// ── Query Keys ─────────────────────────────────────────────────────────────

const twinKeys = {
  all: ['digital-twins'] as const,
  templates: () => [...twinKeys.all, 'templates'] as const,
  template: (id: number) => [...twinKeys.all, 'template', id] as const,
  instances: (machineId?: number) => [...twinKeys.all, 'instances', machineId] as const,
  instance: (id: number) => [...twinKeys.all, 'instance', id] as const,
  elementHistory: (instanceId: number, elementId: string, startDate?: string, endDate?: string) =>
    [...twinKeys.all, 'element-history', instanceId, elementId, startDate, endDate] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 *
 */
export function useTwinTemplates() {
  return useQuery({
    queryKey: twinKeys.templates(),
    queryFn: () => api.get(API_ENDPOINTS.digitalTwins.templates) as Promise<TwinTemplate[]>,
  });
}

/**
 *
 * @param id
 */
export function useTwinTemplate(id: number) {
  return useQuery({
    queryKey: twinKeys.template(id),
    queryFn: () => api.get(API_ENDPOINTS.digitalTwins.templateById(id)) as Promise<TwinTemplate>,
    enabled: id > 0,
  });
}

/**
 *
 */
export function useCreateTwinTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTwinTemplateRequest) =>
      api.post(API_ENDPOINTS.digitalTwins.templates, data) as Promise<TwinTemplate>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: twinKeys.templates() });
    },
  });
}

/**
 *
 * @param machineId
 */
export function useTwinInstances(machineId?: number) {
  return useQuery({
    queryKey: twinKeys.instances(machineId),
    queryFn: () => {
      const url = machineId
        ? `${API_ENDPOINTS.digitalTwins.instances}?machineId=${machineId}`
        : API_ENDPOINTS.digitalTwins.instances;
      return api.get(url) as Promise<TwinInstance[]>;
    },
  });
}

/**
 *
 * @param id
 */
export function useTwinInstance(id: number) {
  return useQuery({
    queryKey: twinKeys.instance(id),
    queryFn: () => api.get(API_ENDPOINTS.digitalTwins.instanceById(id)) as Promise<TwinInstance>,
    enabled: id > 0,
  });
}

/**
 *
 */
export function useCreateTwinInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTwinInstanceRequest) =>
      api.post(API_ENDPOINTS.digitalTwins.instances, data) as Promise<TwinInstance>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: twinKeys.instances() });
    },
  });
}

/**
 *
 */
export function useUpdateTwinInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateTwinInstanceRequest & { id: number }) =>
      api.put(API_ENDPOINTS.digitalTwins.instanceById(id), data) as Promise<TwinInstance>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: twinKeys.instances() });
      queryClient.invalidateQueries({ queryKey: twinKeys.instance(variables.id) });
    },
  });
}

/**
 *
 * @param instanceId
 * @param elementId
 * @param startDate
 * @param endDate
 */
export function useElementHistory(
  instanceId: number,
  elementId: string,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: twinKeys.elementHistory(instanceId, elementId, startDate, endDate),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('elementId', elementId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return api.get(
        `${API_ENDPOINTS.digitalTwins.elementHistory(instanceId)}?${params.toString()}`,
      ) as Promise<ElementHistoryPoint[]>;
    },
    enabled: instanceId > 0 && !!elementId,
  });
}
