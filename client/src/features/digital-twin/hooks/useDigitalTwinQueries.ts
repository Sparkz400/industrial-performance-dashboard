import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';
import type { AssetReading } from './useDigitalTwinLiveData';

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
  category: string;
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
  connection: string;
  values: Record<string, AssetReading>;
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
  value: number | null;
}

type StoredTemplate = Omit<TwinTemplate, 'elements'> & { elementMappings: TwinElementDefinition[] };
type StoredInstance = Omit<TwinInstance, 'bindings'> & {
  nodeBindings: TwinNodeBinding[];
  bindings?: TwinNodeBinding[];
};
const templateResult = (row: StoredTemplate): TwinTemplate => ({
  ...row,
  elements: row.elementMappings ?? [],
});
const instanceResult = (row: StoredInstance): TwinInstance => ({
  ...row,
  bindings: row.bindings ?? row.nodeBindings ?? [],
  values: row.values ?? {},
});

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
    queryFn: async () =>
      ((await api.get(API_ENDPOINTS.digitalTwins.templates)) as StoredTemplate[]).map(
        templateResult,
      ),
  });
}

/**
 *
 * @param id
 */
export function useTwinTemplate(id: number) {
  return useQuery({
    queryKey: twinKeys.template(id),
    queryFn: async () =>
      templateResult(
        (await api.get(API_ENDPOINTS.digitalTwins.templateById(id))) as StoredTemplate,
      ),
    enabled: id > 0,
  });
}

/**
 *
 */
export function useCreateTwinTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ elements, ...data }: CreateTwinTemplateRequest) =>
      api.post(API_ENDPOINTS.digitalTwins.templates, {
        ...data,
        elementMappings: elements,
      }) as Promise<TwinTemplate>,
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
    queryFn: async () => {
      const url = machineId
        ? `${API_ENDPOINTS.digitalTwins.instances}?machineId=${machineId}`
        : API_ENDPOINTS.digitalTwins.instances;
      return ((await api.get(url)) as StoredInstance[]).map(instanceResult);
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
    queryFn: async () => {
      const result = (await api.get(API_ENDPOINTS.digitalTwins.instanceById(id))) as {
        instance: StoredInstance;
        values: Record<string, AssetReading>;
      };
      return { ...instanceResult(result.instance), values: result.values };
    },
    enabled: id > 0,
    refetchInterval: 5000,
  });
}

/**
 *
 */
export function useCreateTwinInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bindings, ...data }: CreateTwinInstanceRequest) =>
      api.post(API_ENDPOINTS.digitalTwins.instances, {
        ...data,
        nodeBindings: bindings,
      }) as Promise<TwinInstance>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: twinKeys.instances() });
    },
  });
}

/**
 *
 */
export function useUpdateTwinTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, elements, ...data }: Partial<CreateTwinTemplateRequest> & { id: number }) =>
      api.put(API_ENDPOINTS.digitalTwins.templateById(id), {
        ...data,
        ...(elements ? { elementMappings: elements } : {}),
      }) as Promise<TwinTemplate>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: twinKeys.templates() });
      queryClient.invalidateQueries({ queryKey: twinKeys.template(variables.id) });
    },
  });
}

/**
 *
 */
export function useDeleteTwinTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(API_ENDPOINTS.digitalTwins.templateById(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: twinKeys.templates() });
    },
  });
}

/**
 *
 */
export function useUpdateTwinInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bindings, ...data }: UpdateTwinInstanceRequest & { id: number }) =>
      api.put(API_ENDPOINTS.digitalTwins.instanceById(id), {
        ...data,
        ...(bindings ? { nodeBindings: bindings } : {}),
      }) as Promise<TwinInstance>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: twinKeys.instances() });
      queryClient.invalidateQueries({ queryKey: twinKeys.instance(variables.id) });
    },
  });
}

/**
 *
 */
export function useDeleteTwinInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(API_ENDPOINTS.digitalTwins.instanceById(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: twinKeys.instances() });
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
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('elementId', elementId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const response = (await api.get(
        `${API_ENDPOINTS.digitalTwins.elementHistory(instanceId)}?${params.toString()}`,
      )) as { dataPoints: ElementHistoryPoint[] };
      return response.dataPoints;
    },
    enabled: instanceId > 0 && !!elementId && !!startDate && !!endDate,
  });
}
