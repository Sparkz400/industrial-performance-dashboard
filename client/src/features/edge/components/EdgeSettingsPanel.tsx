import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import SaveIcon from '@mui/icons-material/Save';
import {
  useEdgeConfig,
  useUpdateEdgeConfig,
  useTriggerSync,
  useEdgeStatus,
  type UpdateEdgeConfigRequest,
} from '../hooks/useEdgeQueries';

const EdgeSettingsPanel: React.FC = () => {
  const { data: config, isLoading: configLoading, error: configError } = useEdgeConfig();
  const { data: status } = useEdgeStatus();
  const updateConfig = useUpdateEdgeConfig();
  const triggerSync = useTriggerSync();

  const [form, setForm] = useState<UpdateEdgeConfigRequest>({
    cloudUrl: '',
    syncIntervalSeconds: 60,
    batchSize: 100,
    retentionDays: 30,
  });

  useEffect(() => {
    if (config) {
      setForm({
        cloudUrl: config.cloudUrl,
        syncIntervalSeconds: config.syncIntervalSeconds,
        batchSize: config.batchSize,
        retentionDays: config.retentionDays,
      });
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate(form);
  };

  if (configLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (configError) {
    return (
      <Alert severity="error">
        Failed to load edge configuration: {(configError as Error).message}
      </Alert>
    );
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Edge Gateway Settings
      </Typography>

      {/* Status summary */}
      {status && (
        <Alert severity={status.cloudConnected ? 'success' : 'warning'} sx={{ mb: 3 }}>
          {status.cloudConnected
            ? `Connected to cloud. Queue: ${status.syncQueueDepth} records.`
            : `Disconnected from cloud. ${status.syncQueueDepth} records queued.`}
          {status.lastSyncAt && (
            <Typography variant="caption" display="block">
              Last sync: {new Date(status.lastSyncAt).toLocaleString()}
            </Typography>
          )}
        </Alert>
      )}

      <Stack spacing={2.5}>
        <TextField
          label="Cloud URL"
          value={form.cloudUrl || ''}
          onChange={(e) => setForm((f) => ({ ...f, cloudUrl: e.target.value }))}
          fullWidth
          placeholder="https://cloud.example.com/api"
        />
        <TextField
          label="Sync Interval (seconds)"
          type="number"
          value={form.syncIntervalSeconds || ''}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              syncIntervalSeconds: parseInt(e.target.value, 10) || 60,
            }))
          }
          fullWidth
          slotProps={{ htmlInput: { min: 10, max: 3600 } }}
        />
        <TextField
          label="Batch Size"
          type="number"
          value={form.batchSize || ''}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              batchSize: parseInt(e.target.value, 10) || 100,
            }))
          }
          fullWidth
          slotProps={{ htmlInput: { min: 1, max: 10000 } }}
        />
        <TextField
          label="Retention Days"
          type="number"
          value={form.retentionDays || ''}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              retentionDays: parseInt(e.target.value, 10) || 30,
            }))
          }
          fullWidth
          slotProps={{ htmlInput: { min: 1, max: 365 } }}
        />

        <Divider />

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={updateConfig.isPending}
          >
            {updateConfig.isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
          <Button
            variant="outlined"
            startIcon={triggerSync.isPending ? <CircularProgress size={18} /> : <SyncIcon />}
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending}
          >
            Sync Now
          </Button>
        </Stack>

        {updateConfig.isSuccess && (
          <Alert severity="success">Configuration saved successfully.</Alert>
        )}
        {updateConfig.isError && (
          <Alert severity="error">Failed to save: {(updateConfig.error as Error).message}</Alert>
        )}
        {triggerSync.isSuccess && <Alert severity="success">Sync triggered successfully.</Alert>}
      </Stack>
    </Paper>
  );
};

export default EdgeSettingsPanel;
