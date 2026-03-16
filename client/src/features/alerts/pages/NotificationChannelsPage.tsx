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
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';

interface NotificationChannel {
  id: number;
  name: string;
  type: 'email' | 'slack' | 'teams' | 'sms';
  isActive: boolean;
  config: Record<string, unknown>;
}

interface ChannelFormValues {
  name: string;
  type: 'email' | 'slack' | 'teams' | 'sms';
  isActive: boolean;
  config: Record<string, string>;
}

const CHANNEL_TYPES = ['email', 'slack', 'teams', 'sms'] as const;

const getTypeColor = (type: string): 'primary' | 'secondary' | 'success' | 'warning' => {
  switch (type) {
    case 'email':
      return 'primary';
    case 'slack':
      return 'secondary';
    case 'teams':
      return 'success';
    case 'sms':
      return 'warning';
    default:
      return 'primary';
  }
};

const defaultFormValues: ChannelFormValues = {
  name: '',
  type: 'email',
  isActive: true,
  config: {},
};

const configFields: Record<string, { key: string; label: string; type?: string }[]> = {
  email: [
    { key: 'smtpHost', label: 'SMTP Host' },
    { key: 'smtpPort', label: 'SMTP Port' },
    { key: 'smtpUser', label: 'SMTP User' },
    { key: 'smtpPass', label: 'SMTP Password', type: 'password' },
    { key: 'fromAddress', label: 'From Address' },
  ],
  slack: [
    { key: 'webhookUrl', label: 'Webhook URL' },
    { key: 'channel', label: 'Channel' },
  ],
  teams: [{ key: 'webhookUrl', label: 'Webhook URL' }],
  sms: [
    { key: 'accountSid', label: 'Account SID' },
    { key: 'authToken', label: 'Auth Token', type: 'password' },
    { key: 'fromNumber', label: 'From Number' },
    { key: 'toNumbers', label: 'To Numbers (comma-separated)' },
  ],
};

const fetchChannels = async (): Promise<NotificationChannel[]> => {
  const res = await protectedFetch(API_ENDPOINTS.alerts.channels);
  if (!res.ok) throw new Error('Failed to fetch notification channels');
  return res.json();
};

const NotificationChannelsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<NotificationChannel | null>(null);
  const [formValues, setFormValues] = useState<ChannelFormValues>(defaultFormValues);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const {
    data: channels = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['notificationChannels'],
    queryFn: fetchChannels,
  });

  const createMutation = useMutation({
    mutationFn: async (values: ChannelFormValues) => {
      const res = await protectedFetch(API_ENDPOINTS.alerts.channels, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to create channel');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationChannels'] });
      handleCloseForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: ChannelFormValues }) => {
      const res = await protectedFetch(API_ENDPOINTS.alerts.channelById(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to update channel');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationChannels'] });
      handleCloseForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await protectedFetch(API_ENDPOINTS.alerts.channelById(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete channel');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationChannels'] });
      setDeleteConfirm(null);
    },
  });

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingChannel(null);
    setFormValues(defaultFormValues);
    setFormErrors({});
  }, []);

  const handleOpenCreate = useCallback(() => {
    setEditingChannel(null);
    setFormValues(defaultFormValues);
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((channel: NotificationChannel) => {
    setEditingChannel(channel);
    setFormValues({
      name: channel.name,
      type: channel.type,
      isActive: channel.isActive,
      config: (channel.config as Record<string, string>) ?? {},
    });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleFormChange = (field: keyof ChannelFormValues, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    if (Object.hasOwn(formErrors, field) && formErrors[field as keyof typeof formErrors]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof typeof next];
        return next;
      });
    }
  };

  const handleConfigChange = (key: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
  };

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = 'Name is required';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (editingChannel) {
      updateMutation.mutate({ id: editingChannel.id, values: formValues });
    } else {
      createMutation.mutate(formValues);
    }
  };

  const mutationError = createMutation.error || updateMutation.error || deleteMutation.error;

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Notification Channels
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure how alerts are delivered (email, Slack, Teams, SMS)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Add Channel
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
      ) : channels.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No notification channels configured
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Add a notification channel to receive alert notifications.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Add Your First Channel
          </Button>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {channels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell>{channel.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={channel.type}
                      color={getTypeColor(channel.type)}
                      size="small"
                      sx={{ textTransform: 'uppercase' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch checked={channel.isActive} size="small" disabled />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleOpenEdit(channel)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleteConfirm(channel)}>
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
          {editingChannel ? 'Edit Notification Channel' : 'Add Notification Channel'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              value={formValues.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              error={!!formErrors.name}
              helperText={formErrors.name}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={formValues.type}
                label="Type"
                onChange={(e) => {
                  handleFormChange('type', e.target.value);
                  handleFormChange('config', {});
                }}
              >
                {CHANNEL_TYPES.map((t) => (
                  <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Type-specific config fields */}
            {(configFields[formValues.type] ?? []).map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                type={field.type ?? 'text'}
                value={formValues.config[field.key] ?? ''}
                onChange={(e) => handleConfigChange(field.key, e.target.value)}
                fullWidth
              />
            ))}
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
        <DialogTitle>Delete Notification Channel</DialogTitle>
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

export default NotificationChannelsPage;
