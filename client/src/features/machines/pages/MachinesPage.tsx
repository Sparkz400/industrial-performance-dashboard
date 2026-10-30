import PageHeader from '@/shared/components/PageHeader';
import { useT } from '@/i18n';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  TextField,
  MenuItem,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMachineStore } from '@/stores/useMachineStore';
import { useStatusStore } from '@/stores/useStatusStore';
import MachineStatusCard from '../components/MachineStatusCard';
import MachineForm from '../components/MachineForm';
import NodeMappingEditor from '../components/NodeMappingEditor';
import type { Machine, MachineFormData, MachineStatusUpdate } from '@/types';
const MachinesPage: React.FC = () => {
  const t = useT();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const machines = useMachineStore((s) => s.machines);
  const loading = useMachineStore((s) => s.loading);
  const error = useMachineStore((s) => s.error);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);
  const addMachine = useMachineStore((s) => s.addMachine);
  const updateMachine = useMachineStore((s) => s.updateMachine);
  const deleteMachine = useMachineStore((s) => s.deleteMachine);
  const connectMachine = useMachineStore((s) => s.connectMachine);
  const disconnectMachine = useMachineStore((s) => s.disconnectMachine);
  const updateMachineStatus = useMachineStore((s) => s.updateMachineStatus);
  const socket = useStatusStore((s) => s.socket);
  const socketConnected = useStatusStore((s) => s.socketConnected);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Machine | null>(null);
  const [mappingMachine, setMappingMachine] = useState<Machine | null>(null);
  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);
  // Listen for machine status updates via WebSocket
  useEffect(() => {
    if (!socket || !socketConnected) return;
    const handleStatusUpdate = (data: MachineStatusUpdate) => {
      updateMachineStatus(data.machineId, data.status);
    };
    socket.on('machineStatusUpdate', handleStatusUpdate);
    return () => {
      socket.off('machineStatusUpdate', handleStatusUpdate);
    };
  }, [socket, socketConnected, updateMachineStatus]);
  const handleAddMachine = useCallback(
    async (data: MachineFormData) => {
      await addMachine(data);
      await fetchMachines();
    },
    [addMachine, fetchMachines],
  );
  const handleUpdateMachine = useCallback(
    async (data: MachineFormData) => {
      if (!editingMachine) return;
      await updateMachine(editingMachine.id, data);
      setEditingMachine(null);
      await fetchMachines();
    },
    [editingMachine, updateMachine, fetchMachines],
  );
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    await deleteMachine(deleteConfirm.id);
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteMachine]);
  const handleConnect = useCallback(
    async (machine: Machine) => {
      try {
        await connectMachine(machine.id);
      } catch (err) {
        console.error('Failed to connect machine:', err);
      }
    },
    [connectMachine],
  );
  const handleDisconnect = useCallback(
    async (machine: Machine) => {
      try {
        await disconnectMachine(machine.id);
      } catch (err) {
        console.error('Failed to disconnect machine:', err);
      }
    },
    [disconnectMachine],
  );
  const visibleMachines = machines.filter(
    (machine) =>
      `${machine.name} ${machine.endpointUrl}`.toLowerCase().includes(search.toLowerCase()) &&
      (statusFilter === 'all' || machine.status === statusFilter),
  );
  if (formOpen)
    return (
      <MachineForm
        open
        onClose={() => {
          setFormOpen(false);
          setEditingMachine(null);
        }}
        onSubmit={editingMachine ? handleUpdateMachine : handleAddMachine}
        machine={editingMachine}
      />
    );
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, width: '100%', mx: 'auto' }}>
      <PageHeader
        title={t('Machines')}
        description={t(
          'Manage OPC-UA server connections and node mappings',
          'OPC-UA-Verbindungen und Signalzuordnungen verwalten',
        )}
        actions={
          <>
            <Button startIcon={<RefreshIcon />} onClick={fetchMachines} disabled={loading}>
              {t('Refresh')}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditingMachine(null);
                setFormOpen(true);
              }}
            >
              {t('Add Machine', 'Maschine hinzufügen')}
            </Button>
          </>
        }
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <TextField
          label={t('Search machines', 'Maschinen suchen')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ flex: '1 1 220px' }}
        />
        <TextField
          select
          label={t('Connection status', 'Verbindungsstatus')}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          sx={{ flex: '1 1 180px' }}
        >
          {['all', 'connected', 'disconnected', 'connecting', 'error', 'no_mappings'].map(
            (value) => (
              <MenuItem key={value} value={value}>
                {t(value === 'all' ? 'All' : value)}
              </MenuItem>
            ),
          )}
        </TextField>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {loading && machines.length === 0 ? (
        <Box sx={{ py: 2 }}>
          <PageSkeleton variant="cards" count={3} />
        </Box>
      ) : machines.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{
              color: 'text.secondary',
            }}
          >
            No machines configured
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              mb: 3,
            }}
          >
            Add an OPC-UA server to start monitoring. You can browse its nodes and map them to
            widgets.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
            Add Your First Machine
          </Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {visibleMachines.map((machine) => (
            <Grid
              key={machine.id}
              size={{
                xs: 12,
                sm: 6,
                lg: 4,
              }}
            >
              <MachineStatusCard
                machine={machine}
                onEdit={(m) => {
                  setEditingMachine(m);
                  setFormOpen(true);
                }}
                onDelete={(m) => setDeleteConfirm(m)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onManageMappings={(m) => setMappingMachine(m)}
              />
            </Grid>
          ))}
        </Grid>
      )}
      {machines.length > 0 && visibleMachines.length === 0 && (
        <Typography role="status">
          {t('No machines match these filters.', 'Keine Maschinen entsprechen diesen Filtern.')}
        </Typography>
      )}
      {/* Node Mapping Editor Dialog */}
      <NodeMappingEditor
        open={!!mappingMachine}
        onClose={() => setMappingMachine(null)}
        machine={mappingMachine}
      />
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Machine</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This will remove all
            its node mappings and disconnect it. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default MachinesPage;
