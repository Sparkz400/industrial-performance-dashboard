import React, { useState, useCallback, useEffect } from 'react';
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
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';
import { useMachineStore } from '@/stores/useMachineStore';
import type { SelectChangeEvent } from '@mui/material';

interface ReportSchedule {
  id: number;
  name: string;
  templateId: number;
  templateName: string;
  cronExpression: string;
  cronHumanReadable: string;
  timezone: string;
  machineIds: number[];
  recipients: string[];
  deliveryChannels: string[];
  nextRunAt: string | null;
  lastRunStatus: string | null;
  isActive: boolean;
}

interface ReportTemplate {
  id: number;
  name: string;
}

interface ScheduleFormValues {
  name: string;
  templateId: number | '';
  cronExpression: string;
  timezone: string;
  machineIds: number[];
  recipients: string;
  deliveryChannels: string[];
}

const DELIVERY_CHANNELS = ['email'];
const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Stockholm',
  'Asia/Tokyo',
  'Asia/Shanghai',
];

const defaultFormValues: ScheduleFormValues = {
  name: '',
  templateId: '',
  cronExpression: '0 6 * * *',
  timezone: 'UTC',
  machineIds: [],
  recipients: '',
  deliveryChannels: ['email'],
};

const getStatusColor = (status: string | null): 'success' | 'error' | 'warning' | 'default' => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'running':
      return 'warning';
    default:
      return 'default';
  }
};

const formatDate = (isoDate: string | null): string => {
  if (!isoDate) return '-';
  return new Date(isoDate).toLocaleString();
};

const fetchSchedules = async (): Promise<ReportSchedule[]> => {
  const res = await protectedFetch(API_ENDPOINTS.reports.schedules);
  if (!res.ok) throw new Error('Failed to fetch report schedules');
  return res.json();
};

const fetchTemplates = async (): Promise<ReportTemplate[]> => {
  const res = await protectedFetch(API_ENDPOINTS.reports.templates);
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
};

const ReportSchedulesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const machines = useMachineStore((s) => s.machines);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);
  useEffect(() => {
    void fetchMachines();
  }, [fetchMachines]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ReportSchedule | null>(null);
  const [formValues, setFormValues] = useState<ScheduleFormValues>(defaultFormValues);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const {
    data: schedules = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['reportSchedules'],
    refetchInterval: 5000,
    queryFn: fetchSchedules,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['reportTemplatesList'],
    queryFn: fetchTemplates,
  });

  const createMutation = useMutation({
    mutationFn: async (values: ScheduleFormValues) => {
      const payload = {
        ...values,
        recipients: values.recipients
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      };
      const res = await protectedFetch(API_ENDPOINTS.reports.schedules, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create schedule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportSchedules'] });
      handleCloseForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: ScheduleFormValues }) => {
      const payload = {
        ...values,
        recipients: values.recipients
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      };
      const res = await protectedFetch(API_ENDPOINTS.reports.scheduleById(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update schedule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportSchedules'] });
      handleCloseForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await protectedFetch(API_ENDPOINTS.reports.scheduleById(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete schedule');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportSchedules'] });
      setDeleteConfirm(null);
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await protectedFetch(API_ENDPOINTS.reports.runNow(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });
      if (!res.ok) throw new Error('Failed to trigger report run');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportSchedules'] });
    },
  });

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingSchedule(null);
    setFormValues(defaultFormValues);
    setFormErrors({});
  }, []);

  const handleOpenCreate = useCallback(() => {
    setEditingSchedule(null);
    setFormValues(defaultFormValues);
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((schedule: ReportSchedule) => {
    setEditingSchedule(schedule);
    setFormValues({
      name: schedule.name,
      templateId: schedule.templateId,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      machineIds: schedule.machineIds ?? [],
      recipients: (schedule.recipients ?? []).join(', '),
      deliveryChannels: schedule.deliveryChannels ?? ['email'],
    });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleMachineIdsChange = (event: SelectChangeEvent<number[]>) => {
    const value = event.target.value;
    setFormValues((prev) => ({
      ...prev,
      machineIds: typeof value === 'string' ? [] : value,
    }));
  };

  const handleDeliveryChannelsChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setFormValues((prev) => ({
      ...prev,
      deliveryChannels: typeof value === 'string' ? [value] : value,
    }));
  };

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = 'Name is required';
    if (!formValues.templateId) errors.templateId = 'Template is required';
    if (!formValues.cronExpression.trim()) errors.cronExpression = 'Cron expression is required';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (editingSchedule) {
      updateMutation.mutate({ id: editingSchedule.id, values: formValues });
    } else {
      createMutation.mutate(formValues);
    }
  };

  const mutationError =
    createMutation.error || updateMutation.error || deleteMutation.error || runNowMutation.error;

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Report Schedules
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Schedule automated report generation and delivery
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Create Schedule
          </Button>
        </Box>
      </Box>

      {(error || mutationError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error)?.message || (mutationError as Error)?.message}
        </Alert>
      )}

      {isLoading ? (
        <PageSkeleton variant="cards" count={3} />
      ) : schedules.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No report schedules configured
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Schedule reports to be generated and delivered automatically.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Create Your First Schedule
          </Button>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Template</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Next Run</TableCell>
                <TableCell>Last Status</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>{schedule.name}</TableCell>
                  <TableCell>
                    {templates.find((template) => template.id === schedule.templateId)?.name ??
                      schedule.templateId}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                      {schedule.cronExpression}
                    </Typography>
                    {schedule.cronHumanReadable && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {schedule.cronHumanReadable}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(schedule.nextRunAt)}</TableCell>
                  <TableCell>
                    {schedule.lastRunStatus ? (
                      <Chip
                        label={schedule.lastRunStatus}
                        color={getStatusColor(schedule.lastRunStatus)}
                        size="small"
                        sx={{ textTransform: 'capitalize' }}
                      />
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={schedule.isActive} size="small" disabled />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      title="Run Now"
                      onClick={() => runNowMutation.mutate(schedule.id)}
                      disabled={runNowMutation.isPending}
                    >
                      <PlayArrowIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Edit schedule"
                      onClick={() => handleOpenEdit(schedule)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Delete schedule"
                      onClick={() => setDeleteConfirm(schedule)}
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
      <Dialog open={formOpen} onClose={handleCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSchedule ? 'Edit Report Schedule' : 'Create Report Schedule'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              value={formValues.name}
              onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
              error={!!formErrors.name}
              helperText={formErrors.name}
              fullWidth
              required
            />
            <FormControl fullWidth error={!!formErrors.templateId}>
              <InputLabel id="report-template">Template</InputLabel>
              <Select
                value={formValues.templateId}
                label="Template"
                labelId="report-template"
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, templateId: e.target.value as number }))
                }
              >
                <MenuItem value="">
                  <em>Select a template</em>
                </MenuItem>
                {templates.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Cron Expression"
              value={formValues.cronExpression}
              onChange={(e) =>
                setFormValues((prev) => ({ ...prev, cronExpression: e.target.value }))
              }
              error={!!formErrors.cronExpression}
              helperText={formErrors.cronExpression || 'e.g., 0 6 * * * (daily at 6 AM)'}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel id="report-timezone">Timezone</InputLabel>
              <Select
                value={formValues.timezone}
                label="Timezone"
                labelId="report-timezone"
                onChange={(e) => setFormValues((prev) => ({ ...prev, timezone: e.target.value }))}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <MenuItem key={tz} value={tz}>
                    {tz}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="report-machines">Machines</InputLabel>
              <Select
                multiple
                labelId="report-machines"
                value={formValues.machineIds}
                onChange={handleMachineIdsChange}
                input={<OutlinedInput label="Machines" />}
                renderValue={(selected) =>
                  selected.map((id) => machines.find((m) => m.id === id)?.name || id).join(', ')
                }
              >
                {machines.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Recipients (comma-separated emails)"
              value={formValues.recipients}
              onChange={(e) => setFormValues((prev) => ({ ...prev, recipients: e.target.value }))}
              fullWidth
              placeholder="user@example.com, admin@example.com"
            />
            <FormControl fullWidth>
              <InputLabel id="report-delivery-channels">Delivery Channels</InputLabel>
              <Select
                multiple
                labelId="report-delivery-channels"
                value={formValues.deliveryChannels}
                onChange={handleDeliveryChannelsChange}
                input={<OutlinedInput label="Delivery Channels" />}
                renderValue={(selected) => selected.join(', ')}
              >
                {[...new Set([...DELIVERY_CHANNELS, ...formValues.deliveryChannels])].map((ch) => (
                  <MenuItem key={ch} value={ch} sx={{ textTransform: 'capitalize' }}>
                    {DELIVERY_CHANNELS.includes(ch) ? ch : `${ch} (unavailable)`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {formValues.deliveryChannels.some(
              (channel) => !DELIVERY_CHANNELS.includes(channel),
            ) && (
              <Alert severity="warning">
                Only email report delivery is implemented. Remove unavailable channels to save this
                schedule.
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForm}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Report Schedule</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReportSchedulesPage;
