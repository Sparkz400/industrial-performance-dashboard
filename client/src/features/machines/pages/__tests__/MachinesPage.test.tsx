import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { Machine } from '@/types';

// Mock the stores
const mockFetchMachines = vi.fn();
const mockAddMachine = vi.fn();
const mockUpdateMachine = vi.fn();
const mockDeleteMachine = vi.fn();
const mockConnectMachine = vi.fn();
const mockDisconnectMachine = vi.fn();
const mockUpdateMachineStatus = vi.fn();

let mockMachineState: Record<string, unknown> = {
  machines: [],
  loading: false,
  error: null,
  fetchMachines: mockFetchMachines,
  addMachine: mockAddMachine,
  updateMachine: mockUpdateMachine,
  deleteMachine: mockDeleteMachine,
  connectMachine: mockConnectMachine,
  disconnectMachine: mockDisconnectMachine,
  updateMachineStatus: mockUpdateMachineStatus,
};

vi.mock('@/stores/useMachineStore', () => ({
  useMachineStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector(mockMachineState),
  ),
}));

vi.mock('@/stores/useStatusStore', () => ({
  useStatusStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({ socket: null, socketConnected: false }),
  ),
}));

// Mock child components
vi.mock('../../components/MachineStatusCard', () => ({
  default: ({
    machine,
    onEdit,
    onDelete,
    onConnect,
    onDisconnect,
    onManageMappings,
  }: {
    machine: { id: number; name: string };
    onEdit: (machine: { id: number; name: string }) => void;
    onDelete: (machine: { id: number; name: string }) => void;
    onConnect: (machine: { id: number; name: string }) => void;
    onDisconnect: (machine: { id: number; name: string }) => void;
    onManageMappings: (machine: { id: number; name: string }) => void;
  }) => (
    <div data-testid={`machine-card-${machine.id}`}>
      <span>{machine.name}</span>
      <button data-testid={`edit-${machine.id}`} onClick={() => onEdit(machine)}>
        Edit
      </button>
      <button data-testid={`delete-${machine.id}`} onClick={() => onDelete(machine)}>
        Delete
      </button>
      <button data-testid={`connect-${machine.id}`} onClick={() => onConnect(machine)}>
        Connect
      </button>
      <button data-testid={`disconnect-${machine.id}`} onClick={() => onDisconnect(machine)}>
        Disconnect
      </button>
      <button data-testid={`mappings-${machine.id}`} onClick={() => onManageMappings(machine)}>
        Mappings
      </button>
    </div>
  ),
}));

vi.mock('../../components/MachineForm', () => ({
  default: ({
    open,
    onClose,
    onSubmit,
    machine,
  }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string; ip: string; port: number }) => void;
    machine?: unknown;
  }) =>
    open ? (
      <div data-testid="machine-form">
        <span data-testid="form-mode">{machine ? 'edit' : 'add'}</span>
        <button data-testid="form-close" onClick={onClose}>
          Close
        </button>
        <button
          data-testid="form-submit"
          onClick={() => onSubmit({ name: 'Test', ip: '127.0.0.1', port: 4840 })}
        >
          Submit
        </button>
      </div>
    ) : null,
}));

vi.mock('../../components/NodeMappingEditor', () => ({
  default: ({
    open,
    onClose,
    machine,
  }: {
    open: boolean;
    onClose: () => void;
    machine?: { name: string };
  }) =>
    open ? (
      <div data-testid="node-mapping-editor">
        <span>{machine?.name}</span>
        <button data-testid="mapping-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock('@/shared/components/loading/PageSkeleton', () => ({
  default: () => <div data-testid="page-skeleton">Loading...</div>,
}));

import MachinesPage from '../MachinesPage';

const createMachine = (overrides: Partial<Machine> = {}): Machine =>
  ({
    id: 1,
    name: 'Test Machine',
    endpointUrl: 'opc.tcp://localhost:4840',
    ip: 'localhost',
    port: 4840,
    resourcePath: '',
    securityMode: 'None',
    securityPolicy: 'None',
    isActive: true,
    status: 'disconnected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }) as Machine;

describe('MachinesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMachineState = {
      machines: [],
      loading: false,
      error: null,
      fetchMachines: mockFetchMachines,
      addMachine: mockAddMachine,
      updateMachine: mockUpdateMachine,
      deleteMachine: mockDeleteMachine,
      connectMachine: mockConnectMachine,
      disconnectMachine: mockDisconnectMachine,
      updateMachineStatus: mockUpdateMachineStatus,
    };
  });

  it('should render the page title', () => {
    render(<MachinesPage />);
    expect(screen.getByText('Machines')).toBeInTheDocument();
  });

  it('should fetch machines on mount', () => {
    render(<MachinesPage />);
    expect(mockFetchMachines).toHaveBeenCalledOnce();
  });

  it('should show empty state when no machines exist', () => {
    render(<MachinesPage />);
    expect(screen.getByText('No machines configured')).toBeInTheDocument();
    expect(screen.getByText('Add Your First Machine')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading with no machines', () => {
    mockMachineState.loading = true;
    render(<MachinesPage />);
    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
  });

  it('should show error alert when there is an error', () => {
    mockMachineState.error = 'Failed to fetch machines';
    render(<MachinesPage />);
    expect(screen.getByText('Failed to fetch machines')).toBeInTheDocument();
  });

  it('should render machine cards when machines exist', () => {
    mockMachineState.machines = [
      createMachine({ id: 1, name: 'Machine A' }),
      createMachine({ id: 2, name: 'Machine B' }),
    ];
    render(<MachinesPage />);

    expect(screen.getByTestId('machine-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('machine-card-2')).toBeInTheDocument();
    expect(screen.getByText('Machine A')).toBeInTheDocument();
    expect(screen.getByText('Machine B')).toBeInTheDocument();
  });

  it('should open add machine form when "Add Machine" is clicked', () => {
    render(<MachinesPage />);
    fireEvent.click(screen.getByText('Add Machine'));
    expect(screen.getByTestId('machine-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-mode')).toHaveTextContent('add');
  });

  it('should open edit form when edit is clicked on a machine card', () => {
    mockMachineState.machines = [createMachine({ id: 1, name: 'Machine A' })];
    render(<MachinesPage />);

    fireEvent.click(screen.getByTestId('edit-1'));
    expect(screen.getByTestId('machine-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-mode')).toHaveTextContent('edit');
  });

  it('should show delete confirmation dialog', () => {
    mockMachineState.machines = [createMachine({ id: 1, name: 'Machine A' })];
    render(<MachinesPage />);

    fireEvent.click(screen.getByTestId('delete-1'));
    expect(screen.getByText('Delete Machine')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('should delete machine on confirmation', async () => {
    mockMachineState.machines = [createMachine({ id: 1, name: 'Machine A' })];
    mockDeleteMachine.mockResolvedValue(undefined);
    render(<MachinesPage />);

    // Open delete confirmation
    fireEvent.click(screen.getByTestId('delete-1'));

    // Click the "Delete" button in the confirmation dialog
    const deleteButtons = screen.getAllByText('Delete');
    const confirmDeleteBtn = deleteButtons.find((btn) => btn.closest('[role="dialog"]') !== null);
    if (confirmDeleteBtn) {
      fireEvent.click(confirmDeleteBtn);
    }

    await waitFor(() => {
      expect(mockDeleteMachine).toHaveBeenCalledWith(1);
    });
  });

  it('should call refresh when Refresh button is clicked', () => {
    render(<MachinesPage />);
    fireEvent.click(screen.getByText('Refresh'));
    // fetchMachines called on mount + on refresh click
    expect(mockFetchMachines).toHaveBeenCalledTimes(2);
  });

  it('should open node mapping editor when manage mappings is clicked', () => {
    mockMachineState.machines = [createMachine({ id: 1, name: 'Machine A' })];
    render(<MachinesPage />);

    fireEvent.click(screen.getByTestId('mappings-1'));
    expect(screen.getByTestId('node-mapping-editor')).toBeInTheDocument();
  });
});
