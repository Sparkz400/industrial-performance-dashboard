import { create } from 'zustand';
import { api } from '../utils/api';
import { API_ENDPOINTS } from '../config/config';
import type { Machine, NodeMapping, BrowsedNode, MachineFormData } from '../types';

interface MachineState {
  machines: Machine[];
  selectedMachineId: number | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchMachines: () => Promise<void>;
  addMachine: (data: MachineFormData) => Promise<Machine>;
  updateMachine: (id: number, data: MachineFormData) => Promise<Machine>;
  deleteMachine: (id: number) => Promise<void>;
  connectMachine: (id: number) => Promise<void>;
  disconnectMachine: (id: number) => Promise<void>;
  setSelectedMachineId: (id: number | null) => void;
  getMappings: (machineId: number) => Promise<NodeMapping[]>;
  saveMappings: (machineId: number, mappings: Partial<NodeMapping>[]) => Promise<NodeMapping[]>;
  deleteMapping: (machineId: number, mappingId: number) => Promise<void>;
  browseNodes: (machineId: number, parentNodeId?: string) => Promise<BrowsedNode[]>;
  updateMachineStatus: (machineId: number, status: string) => void;
}

export const useMachineStore = create<MachineState>((set) => ({
  machines: [],
  selectedMachineId: null,
  loading: false,
  error: null,

  fetchMachines: async () => {
    set({ loading: true, error: null });
    try {
      const machines = await api.get(API_ENDPOINTS.machines.base) as Machine[];
      set({ machines, loading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  addMachine: async (data: MachineFormData) => {
    const machine = await api.post(API_ENDPOINTS.machines.base, data) as Machine;
    set((state) => ({ machines: [...state.machines, machine] }));
    return machine;
  },

  updateMachine: async (id: number, data: MachineFormData) => {
    const machine = await api.put(API_ENDPOINTS.machines.byId(id), data) as Machine;
    set((state) => ({
      machines: state.machines.map((m) => (m.id === id ? { ...m, ...machine } : m)),
    }));
    return machine;
  },

  deleteMachine: async (id: number) => {
    await api.delete(API_ENDPOINTS.machines.byId(id));
    set((state) => ({
      machines: state.machines.filter((m) => m.id !== id),
      selectedMachineId: state.selectedMachineId === id ? null : state.selectedMachineId,
    }));
  },

  connectMachine: async (id: number) => {
    await api.post(API_ENDPOINTS.machines.connect(id));
    set((state) => ({
      machines: state.machines.map((m) => (m.id === id ? { ...m, status: 'connecting' } : m)),
    }));
  },

  disconnectMachine: async (id: number) => {
    await api.post(API_ENDPOINTS.machines.disconnect(id));
    set((state) => ({
      machines: state.machines.map((m) => (m.id === id ? { ...m, status: 'disconnected' } : m)),
    }));
  },

  setSelectedMachineId: (id: number | null) => {
    set({ selectedMachineId: id });
  },

  getMappings: async (machineId: number) =>
    await api.get(API_ENDPOINTS.machines.mappings(machineId)) as NodeMapping[],

  saveMappings: async (machineId: number, mappings: Partial<NodeMapping>[]) => {
    const formatted = mappings.map((m) => ({
      nodeId: m.node_id,
      nodeKey: m.node_key,
      displayName: m.display_name,
      dataType: m.data_type || 'Double',
      samplingInterval: m.sampling_interval || 500,
      isActive: m.is_active !== false,
    }));
    return await api.post(API_ENDPOINTS.machines.mappings(machineId), { mappings: formatted }) as NodeMapping[];
  },

  deleteMapping: async (machineId: number, mappingId: number) => {
    await api.delete(API_ENDPOINTS.machines.deleteMapping(machineId, mappingId));
  },

  browseNodes: async (machineId: number, parentNodeId?: string) =>
    await api.post(API_ENDPOINTS.machines.browseNodes(machineId), {
      parentNodeId: parentNodeId || '',
    }) as BrowsedNode[],

  updateMachineStatus: (machineId: number, status: string) => {
    set((state) => ({
      machines: state.machines.map((m) => (m.id === machineId ? { ...m, status } : m)),
    }));
  },
}));
