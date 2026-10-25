import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/utils/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
import { api } from '@/utils/api';
import { useMachineStore } from '../useMachineStore';
import type { Machine, NodeMapping } from '@/types';
const machine = {
  id: 1,
  name: 'Simulator',
  ip: 'localhost',
  port: 4841,
  resourcePath: '/UA/MyLittleServer',
  endpointUrl: 'opc.tcp://localhost:4841/UA/MyLittleServer',
  securityMode: 'None',
  securityPolicy: 'None',
  isActive: true,
  status: 'connected',
  createdAt: '',
  updatedAt: '',
} satisfies Machine;
beforeEach(() => {
  vi.resetAllMocks();
  useMachineStore.setState({ machines: [], selectedMachineId: null, loading: false, error: null });
});
it('keeps the API machine fields intact through list, create, edit and delete', async () => {
  vi.mocked(api.get).mockResolvedValue([machine]);
  await useMachineStore.getState().fetchMachines();
  expect(useMachineStore.getState().machines[0]).toEqual(machine);
  vi.mocked(api.post).mockResolvedValue({ ...machine, id: 2 });
  await useMachineStore.getState().addMachine(machine);
  vi.mocked(api.put).mockResolvedValue({ ...machine, name: 'Renamed' });
  await useMachineStore.getState().updateMachine(1, machine);
  expect(useMachineStore.getState().machines[0].name).toBe('Renamed');
  useMachineStore.getState().setSelectedMachineId(1);
  await useMachineStore.getState().deleteMachine(1);
  expect(useMachineStore.getState().selectedMachineId).toBeNull();
  expect(useMachineStore.getState().machines.map((m) => m.id)).toEqual([2]);
});
it('round-trips Boolean mappings without erasing identifiers or sampling intervals', async () => {
  const mapping = {
    id: 5,
    machineId: 1,
    nodeId: 'ns=1;s=Running',
    nodeKey: 'OperationMode',
    displayName: 'Running',
    dataType: 'Boolean',
    samplingInterval: 1000,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  } satisfies NodeMapping;
  vi.mocked(api.get).mockResolvedValue([mapping]);
  const mappings = await useMachineStore.getState().getMappings(1);
  await useMachineStore.getState().saveMappings(1, mappings);
  expect(api.post).toHaveBeenCalledWith(expect.stringContaining('/1/mappings'), {
    mappings: [
      {
        nodeId: mapping.nodeId,
        nodeKey: 'OperationMode',
        displayName: 'Running',
        dataType: 'Boolean',
        samplingInterval: 1000,
        isActive: true,
      },
    ],
  });
  await useMachineStore.getState().deleteMapping(1, 5);
  expect(api.delete).toHaveBeenCalledWith(expect.stringContaining('/1/mappings/5'));
});
it('surfaces fetch errors and tracks connection state', async () => {
  vi.mocked(api.get).mockRejectedValue(new Error('offline'));
  await useMachineStore.getState().fetchMachines();
  expect(useMachineStore.getState()).toMatchObject({ error: 'offline', loading: false });
  useMachineStore.setState({ machines: [machine] });
  await useMachineStore.getState().connectMachine(1);
  useMachineStore.getState().updateMachineStatus(1, 'connected');
  expect(useMachineStore.getState().machines[0].status).toBe('connected');
  await useMachineStore.getState().disconnectMachine(1);
  expect(useMachineStore.getState().machines[0].status).toBe('disconnected');
  await useMachineStore.getState().browseNodes(1, 'ObjectsFolder');
  expect(api.post).toHaveBeenLastCalledWith(expect.stringContaining('/browse'), {
    parentNodeId: 'ObjectsFolder',
  });
});
