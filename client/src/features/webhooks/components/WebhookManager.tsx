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
import { API_BASE_URL } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@/i18n';

const AVAILABLE_EVENTS = [
  { value: '*', label: 'All supported alarm events' },
  { value: 'alarm.triggered', label: 'Alarm Triggered' },
  { value: 'alarm.cleared', label: 'Alarm Cleared' },
  { value: 'cmms.handoff', label: 'Reviewed maintenance handoff' },
];

const emptyForm = {
  name: '',
  kind: 'webhook' as 'webhook' | 'email',
  url: '',
  recipients: '',
  events: [] as string[],
  minSeverity: '',
  machineIds: '',
};

/**
 *
 */
export default function WebhookManager() {
  const t = useT();
  const [createdSecret, setCreatedSecret] = useState('');
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries'],
    queryFn: async () => {
      const response = await protectedFetch(`${API_BASE_URL}/webhooks/deliveries`);
      if (!response.ok) throw new Error('Cannot read delivery attempts');
      return response.json() as Promise<
        {
          id: number;
          webhookId: number;
          eventType: string;
          schemaVersion: number;
          attempts: number;
          deliveredAt: string | null;
          deadLetteredAt: string | null;
          lastStatus: number | null;
          lastError: string | null;
        }[]
      >;
    },
    refetchInterval: 5000,
  });
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<{
    id: number;
    message: string;
    success: boolean;
  } | null>(null);
  const [form, setForm] = useState(emptyForm);
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
    const email = form.kind === 'email';
    const recipients = form.recipients
      .split(/[,\s]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (!form.name || (email ? recipients.length === 0 : !form.url) || form.events.length === 0) {
      enqueueSnackbar('Fill in all fields', { variant: 'warning' });
      return;
    }
    setCreating(true);
    try {
      const machineIds = form.machineIds
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
      const created = (await api.endpoints.createWebhook({
        name: form.name,
        kind: form.kind,
        ...(email ? { recipients } : { url: form.url }),
        events: form.events,
        minSeverity: form.minSeverity || null,
        machineIds,
      })) as Webhook;
      if (!email) setCreatedSecret(created.secret);
      setDialogOpen(false);
      setForm(emptyForm);
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
          <Typography variant="h6">Webhooks, email and integrations</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          size="small"
        >
          Add destination
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Deliver persisted alarm events with a signed payload. Receivers must deduplicate the
        delivery ID (body id and X-Webhook-Delivery-Id header). Failed deliveries retry with
        increasing delay for about a day, then stop and can be requeued here; the test button is a
        separate test event.
      </Typography>

      {createdSecret && (
        <Alert severity="info" onClose={() => setCreatedSecret('')} sx={{ mb: 2 }}>
          Save this signing secret in the receiver; it is shown only after creation.
          <TextField
            fullWidth
            label="New webhook signing secret"
            value={createdSecret}
            slotProps={{ input: { readOnly: true } }}
          />
        </Alert>
      )}
      {deliveries.error && <Alert severity="error">{String(deliveries.error)}</Alert>}
      {deliveries.data && deliveries.data.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography fontWeight="bold">Delivery attempts (up to 100, pending first)</Typography>
          {deliveries.data.map((delivery) => (
            <Typography
              variant="body2"
              key={delivery.id}
              color={delivery.deadLetteredAt ? 'error' : undefined}
            >
              Delivery {delivery.id} ({delivery.eventType} v{delivery.schemaVersion}) → webhook{' '}
              {delivery.webhookId}:{' '}
              {delivery.deliveredAt
                ? 'delivered'
                : delivery.deadLetteredAt
                  ? 'stopped retrying'
                  : 'pending retry'}{' '}
              · attempts {delivery.attempts} · last HTTP status {delivery.lastStatus ?? 'not sent'}
              {delivery.lastError && ` · ${delivery.lastError}`}
              {delivery.deadLetteredAt && (
                <Button
                  size="small"
                  sx={{ ml: 1 }}
                  onClick={async () => {
                    const response = await protectedFetch(
                      `${API_BASE_URL}/webhooks/deliveries/${delivery.id}/requeue`,
                      { method: 'POST' },
                    );
                    enqueueSnackbar(
                      response.ok ? `Delivery ${delivery.id} requeued` : 'Requeue failed',
                      { variant: response.ok ? 'success' : 'error' },
                    );
                    void deliveries.refetch();
                  }}
                >
                  Requeue delivery {delivery.id}
                </Button>
              )}
            </Typography>
          ))}
        </Box>
      )}

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
                        {webhook.kind === 'email'
                          ? `Email to ${(webhook.recipients ?? []).join(', ')}`
                          : webhook.url}
                        {webhook.minSeverity ? ` · ${webhook.minSeverity} and above` : ''}
                        {webhook.machineIds?.length
                          ? ` · machines ${webhook.machineIds.join(', ')}`
                          : ''}
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
        <DialogTitle>Add notification destination</DialogTitle>
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
            select
            label="Destination type"
            fullWidth
            size="small"
            value={form.kind}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                kind: e.target.value as 'webhook' | 'email',
                events: f.events.filter(
                  (ev) => e.target.value !== 'email' || ev.startsWith('alarm.'),
                ),
              }))
            }
          >
            <MenuItem value="webhook">Webhook (signed JSON)</MenuItem>
            <MenuItem value="email">Email (alarm events, via the configured mail server)</MenuItem>
          </TextField>
          {form.kind === 'email' ? (
            <TextField
              label="Recipients"
              fullWidth
              size="small"
              value={form.recipients}
              onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))}
              placeholder="shift-lead@example.com, maintenance@example.com"
              helperText="Comma-separated; at most 20."
            />
          ) : (
            <TextField
              label="Endpoint URL"
              fullWidth
              size="small"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://your-service.com/webhook"
            />
          )}
          <TextField
            select
            label="Lowest alarm severity delivered"
            fullWidth
            size="small"
            value={form.minSeverity}
            onChange={(e) => setForm((f) => ({ ...f, minSeverity: e.target.value }))}
          >
            <MenuItem value="">All severities</MenuItem>
            {['low', 'medium', 'high', 'critical'].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Only these machine IDs (optional)"
            fullWidth
            size="small"
            value={form.machineIds}
            onChange={(e) => setForm((f) => ({ ...f, machineIds: e.target.value }))}
            helperText="Comma-separated machine IDs; empty delivers alarms from every machine."
          />
          <FormControl fullWidth size="small">
            <InputLabel id="destination-events">Events</InputLabel>
            <Select
              labelId="destination-events"
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
              {AVAILABLE_EVENTS.filter(
                (event) => form.kind !== 'email' || event.value.startsWith('alarm.'),
              ).map((event) => (
                <MenuItem key={event.value} value={event.value}>
                  {event.value === 'cmms.handoff'
                    ? t(event.label, 'Geprüfte Instandhaltungsübergabe')
                    : event.label}
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
