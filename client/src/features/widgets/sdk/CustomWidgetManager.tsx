import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExtensionIcon from '@mui/icons-material/Extension';
import { useSnackbar } from 'notistack';
import { api } from '@/utils/api';
import type { CustomWidgetRegistration, CustomWidgetManifest } from '@/types';

/**
 *
 */
export default function CustomWidgetManager() {
  const [widgets, setWidgets] = useState<CustomWidgetRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

  const loadWidgets = useCallback(async () => {
    try {
      const data = (await api.endpoints.getCustomWidgets()) as CustomWidgetRegistration[];
      setWidgets(data);
    } catch {
      enqueueSnackbar('Failed to load custom widgets', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    loadWidgets();
  }, [loadWidgets]);

  const handleInstall = useCallback(async () => {
    if (!manifestUrl) return;
    setInstalling(true);
    try {
      await api.endpoints.registerCustomWidget(manifestUrl);
      setDialogOpen(false);
      setManifestUrl('');
      loadWidgets();
      enqueueSnackbar('Custom widget installed', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Failed to install widget', {
        variant: 'error',
      });
    } finally {
      setInstalling(false);
    }
  }, [manifestUrl, loadWidgets, enqueueSnackbar]);

  const handleUninstall = useCallback(
    async (id: number) => {
      try {
        await api.endpoints.unregisterCustomWidget(id);
        loadWidgets();
        enqueueSnackbar('Widget uninstalled', { variant: 'success' });
      } catch {
        enqueueSnackbar('Failed to uninstall widget', { variant: 'error' });
      }
    },
    [loadWidgets, enqueueSnackbar],
  );

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
          <ExtensionIcon color="primary" />
          <Typography variant="h6">Custom Widget SDK</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          size="small"
        >
          Install Widget
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Install custom widgets from external sources. Widgets communicate with the dashboard via a
        secure postMessage iframe protocol.
      </Typography>

      {widgets.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ExtensionIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            No custom widgets installed. Install one by providing a manifest URL.
          </Typography>
        </Paper>
      ) : (
        <List>
          {widgets.map((widget) => {
            const manifest = widget.manifest as CustomWidgetManifest;
            return (
              <Paper
                key={widget.id}
                sx={{ mb: 1, border: 1, borderColor: 'divider', borderRadius: 2 }}
              >
                <ListItem sx={{ py: 1.5 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight={600}>{manifest.name}</Typography>
                        <Chip label={`v${manifest.version}`} size="small" variant="outlined" />
                        <Chip
                          label={widget.isActive ? 'Active' : 'Inactive'}
                          size="small"
                          color={widget.isActive ? 'success' : 'default'}
                        />
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          {manifest.description}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          By {manifest.author} &middot; {manifest.category}
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Uninstall">
                      <IconButton size="small" onClick={() => handleUninstall(widget.id)}>
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              </Paper>
            );
          })}
        </List>
      )}

      {/* Install Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Install Custom Widget</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
        >
          <TextField
            label="Widget Manifest URL"
            fullWidth
            size="small"
            value={manifestUrl}
            onChange={(e) => setManifestUrl(e.target.value)}
            placeholder="https://your-cdn.com/widgets/my-widget/widget-manifest.json"
            helperText="Provide the URL to the widget's manifest.json file"
          />
          <Alert severity="info" variant="outlined">
            Custom widgets run in a sandboxed iframe. They can communicate with the dashboard via a
            postMessage protocol but cannot access your session or credentials.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleInstall}
            disabled={!manifestUrl || installing}
            startIcon={installing ? <CircularProgress size={16} /> : undefined}
          >
            Install
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
