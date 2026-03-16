import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  IconButton,
  Tooltip,
  Switch,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  CircularProgress,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import WebhookIcon from '@mui/icons-material/Webhook';
import { useSnackbar } from 'notistack';
import { api } from '@/utils/api';
import type { Webhook } from '@/types';

const AVAILABLE_EVENTS = [
  { value: '*', label: 'All Events' },
  { value: 'dashboard.created', label: 'Dashboard Created' },
  { value: 'dashboard.updated', label: 'Dashboard Updated' },
  { value: 'dashboard.deleted', label: 'Dashboard Deleted' },
  { value: 'machine.connected', label: 'Machine Connected' },
  { value: 'machine.disconnected', label: 'Machine Disconnected' },
  { value: 'alarm.triggered', label: 'Alarm Triggered' },
  { value: 'alarm.resolved', label: 'Alarm Resolved' },
  { value: 'opcua.data', label: 'OPC UA Data Received' },
];

/**
 *
 */
export default function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<{
    id: number;
    message: string;
    success: boolean;
  } | null>(null);
  const [form, setForm] = useState({ name: '', url: '', events: [] as string[] });
  const [creating, setCreating] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

  const loadWebhooks = useCallback(async () => {
    try {
      const data = (await api.endpoints.getWebhooks()) as Webhook[];
      setWebhooks(data);
    } catch {
      enqueueSnackbar('Failed to load webhooks', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleCreate = useCallback(async () => {
    if (!form.name || !form.url || form.events.length === 0) {
      enqueueSnackbar('Fill in all fields', { variant: 'warning' });
      return;
    }
    setCreating(true);
    try {
      await api.endpoints.createWebhook(form);
      setDialogOpen(false);
      setForm({ name: '', url: '', events: [] });
      loadWebhooks();
      enqueueSnackbar('Webhook created', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to create webhook', { variant: 'error' });
    } finally {
      setCreating(false);
    }
  }, [form, loadWebhooks, enqueueSnackbar]);

  const handleToggle = useCallback(
    async (id: number, isActive: boolean) => {
      try {
        await api.endpoints.updateWebhook(id, { isActive: !isActive });
        loadWebhooks();
      } catch {
        enqueueSnackbar('Failed to update webhook', { variant: 'error' });
      }
    },
    [loadWebhooks, enqueueSnackbar],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await api.endpoints.deleteWebhook(id);
        loadWebhooks();
        enqueueSnackbar('Webhook deleted', { variant: 'success' });
      } catch {
        enqueueSnackbar('Failed to delete webhook', { variant: 'error' });
      }
    },
    [loadWebhooks, enqueueSnackbar],
  );

  const handleTest = useCallback(async (id: number) => {
    setTestResult(null);
    try {
      const result = (await api.endpoints.testWebhook(id)) as { success: boolean; message: string };
      setTestResult({ id, ...result });
    } catch {
      setTestResult({ id, success: false, message: 'Test failed' });
    }
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WebhookIcon color="primary" />
          <Typography variant="h6">Webhooks & Integrations</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          size="small"
        >
          Add Webhook
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Send real-time event notifications to external systems like SAP, MES, AWS IoT, or Azure IoT
        Hub.
      </Typography>

      {webhooks.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <WebhookIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            No webhooks configured. Add one to start sending event notifications.
          </Typography>
        </Paper>
      ) : (
        <List>
          {webhooks.map((webhook) => (
            <Paper
              key={webhook.id}
              sx={{
                mb: 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <ListItem sx={{ py: 1.5 }}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography fontWeight={600}>{webhook.name}</Typography>
                      <Chip
                        label={webhook.isActive ? 'Active' : 'Inactive'}
                        size="small"
                        color={webhook.isActive ? 'success' : 'default'}
                      />
                      {webhook.lastStatus !== null && webhook.lastStatus !== undefined && (
                        <Chip
                          label={`Last: ${webhook.lastStatus}`}
                          size="small"
                          color={
                            webhook.lastStatus >= 200 && webhook.lastStatus < 300
                              ? 'info'
                              : 'warning'
                          }
                          variant="outlined"
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 0.5 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {webhook.url}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {(Array.isArray(webhook.events) ? webhook.events : []).map(
                          (event: string) => (
                            <Chip
                              key={event}
                              label={event}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.7rem' }}
                            />
                          ),
                        )}
                      </Box>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {testResult && testResult.id === webhook.id && (
                      <Chip
                        label={testResult.message}
                        size="small"
                        color={testResult.success ? 'success' : 'error'}
                        sx={{ mr: 1 }}
                      />
                    )}
                    <Tooltip title="Test delivery">
                      <IconButton size="small" onClick={() => handleTest(webhook.id)}>
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Switch
                      size="small"
                      checked={webhook.isActive}
                      onChange={() => handleToggle(webhook.id, webhook.isActive)}
                    />
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(webhook.id)}>
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
            </Paper>
          ))}
        </List>
      )}

      {/* Create Webhook Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Webhook</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
        >
          <TextField
            label="Name"
            fullWidth
            size="small"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g., SAP Integration"
          />
          <TextField
            label="Endpoint URL"
            fullWidth
            size="small"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://your-service.com/webhook"
          />
          <FormControl fullWidth size="small">
            <InputLabel>Events</InputLabel>
            <Select
              multiple
              value={form.events}
              onChange={(e) => setForm((f) => ({ ...f, events: e.target.value as string[] }))}
              input={<OutlinedInput label="Events" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              {AVAILABLE_EVENTS.map((event) => (
                <MenuItem key={event.value} value={event.value}>
                  {event.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Alert severity="info" variant="outlined">
            Webhook payloads are signed with HMAC-SHA256. The secret will be shown once after
            creation.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating}
            startIcon={creating ? <CircularProgress size={16} /> : undefined}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
