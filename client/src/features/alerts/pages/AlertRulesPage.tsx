import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMachineStore } from '@/stores/useMachineStore';
import AlertRuleForm from '../components/AlertRuleForm';
import type { AlertRuleFormValues } from '../components/AlertRuleForm';

interface AlertRule {
  id: number;
  name: string;
  description: string;
  machineId: number | null;
  plantId: number | null;
  nodeKey: string;
  condition: string;
  threshold: number;
  thresholdHigh: number | null;
  rateWindowSeconds: number | null;
  severity: string;
  isActive: boolean;
  channels: number[];
  cooldownSeconds: number;
}

const fetchRules = async (): Promise<AlertRule[]> => {
  const res = await protectedFetch(API_ENDPOINTS.alerts.rules);
  if (!res.ok) throw new Error('Failed to fetch alert rules');
  return res.json();
};

const AlertRulesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const admin = useAuthStore((s) => s.user?.role === 'admin');
  const machines = useMachineStore((s) => s.machines);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AlertRule | null>(null);

  const {
    data: rules = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['alertRules'],
    queryFn: fetchRules,
  });

  const createMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const res = await protectedFetch(API_ENDPOINTS.alerts.rules, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to create rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      setFormOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Record<string, unknown> }) => {
      const res = await protectedFetch(API_ENDPOINTS.alerts.ruleById(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to update rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      setFormOpen(false);
      setEditingRule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await protectedFetch(API_ENDPOINTS.alerts.ruleById(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete rule');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      setDeleteConfirm(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await protectedFetch(API_ENDPOINTS.alerts.ruleById(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error('Failed to toggle rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
    },
  });

  const handleSubmit = useCallback(
    (values: AlertRuleFormValues) => {
      const payload = {
        ...values,
        plantId: null,
        machineId: values.machineId === '' ? null : Number(values.machineId),
        threshold: values.threshold === '' ? null : Number(values.threshold),
        thresholdHigh: values.thresholdHigh === '' ? null : Number(values.thresholdHigh),
        rateWindowSeconds:
          values.rateWindowSeconds === '' ? null : Number(values.rateWindowSeconds),
        cooldownSeconds: values.cooldownSeconds === '' ? 60 : Number(values.cooldownSeconds),
      };
      if (editingRule) {
        updateMutation.mutate({ id: editingRule.id, values: payload });
      } else {
        createMutation.mutate(payload);
      }
    },
    [editingRule, createMutation, updateMutation],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm.id);
    }
  }, [deleteConfirm, deleteMutation]);

  const mutationError =
    createMutation.error || updateMutation.error || deleteMutation.error || toggleMutation.error;

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Alert Rules
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure threshold-based alert rules for monitored nodes
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
          <Button
            variant="contained"
            disabled={!admin}
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingRule(null);
              setFormOpen(true);
            }}
          >
            Create Rule
          </Button>
        </Box>
      </Box>

      {!admin && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Rules are read-only for viewers. You can acknowledge incidents in Alert History.
        </Alert>
      )}
      {rules.some((rule) => rule.plantId != null || rule.channels?.length) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Legacy plant rules and notification channels are unsupported. Select an explicit machine
          or all machines, and configure delivery in Settings → Webhooks.
        </Alert>
      )}
      {(error || mutationError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error)?.message || (mutationError as Error)?.message}
        </Alert>
      )}

      {isLoading ? (
        <PageSkeleton variant="cards" count={3} />
      ) : rules.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No alert rules configured
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create alert rules to get notified when node values exceed thresholds.
          </Typography>
          <Button
            variant="contained"
            disabled={!admin}
            startIcon={<AddIcon />}
            onClick={() => setFormOpen(true)}
          >
            Create Your First Rule
          </Button>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Node Key</TableCell>
                <TableCell>Condition</TableCell>
                <TableCell>Threshold</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {rule.nodeKey}
                    </Typography>
                  </TableCell>
                  <TableCell>{rule.condition}</TableCell>
                  <TableCell>
                    {rule.condition === 'range'
                      ? `${rule.threshold} - ${rule.thresholdHigh}`
                      : rule.threshold}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={rule.severity}
                      size="small"
                      color={
                        rule.severity === 'critical' || rule.severity === 'high'
                          ? 'error'
                          : rule.severity === 'medium'
                            ? 'warning'
                            : 'info'
                      }
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      disabled={!admin}
                      inputProps={{ 'aria-label': `Enable ${rule.name}` }}
                      checked={rule.isActive}
                      onChange={() =>
                        toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      disabled={!admin}
                      size="small"
                      onClick={() => {
                        setEditingRule(rule);
                        setFormOpen(true);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      disabled={!admin}
                      size="small"
                      onClick={() => setDeleteConfirm(rule)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingRule(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}</DialogTitle>
        <DialogContent>
          <AlertRuleForm
            initialValues={
              editingRule
                ? {
                    name: editingRule.name,
                    description: editingRule.description,
                    machineId: editingRule.machineId ?? '',
                    nodeKey: editingRule.nodeKey,
                    condition: editingRule.condition,
                    threshold: editingRule.threshold,
                    thresholdHigh: editingRule.thresholdHigh ?? '',
                    rateWindowSeconds: editingRule.rateWindowSeconds ?? '',
                    severity: editingRule.severity,
                    channels: editingRule.channels ?? [],
                    cooldownSeconds: editingRule.cooldownSeconds,
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            onCancel={() => {
              setFormOpen(false);
              setEditingRule(null);
            }}
            machines={machines.map((m) => ({ id: m.id, name: m.name }))}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Alert Rule</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This action cannot be
            undone.
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

export default AlertRulesPage;
