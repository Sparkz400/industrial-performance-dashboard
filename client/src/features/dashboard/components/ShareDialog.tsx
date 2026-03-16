import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  alpha,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import CodeIcon from '@mui/icons-material/Code';
import { useSnackbar } from 'notistack';
import { api } from '@/utils/api';
import type { ShareToken, CreateShareResponse } from '@/types';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  dashboardName: string;
}

/**
 *
 * @param root0
 * @param root0.open
 * @param root0.onClose
 * @param root0.dashboardId
 * @param root0.dashboardName
 */
export default function ShareDialog({
  open,
  onClose,
  dashboardId,
  dashboardName,
}: ShareDialogProps) {
  const [shares, setShares] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState<string>('');
  const [allowEmbed, setAllowEmbed] = useState(false);
  const [newShareUrl, setNewShareUrl] = useState('');
  const [newEmbedUrl, setNewEmbedUrl] = useState('');
  const { enqueueSnackbar } = useSnackbar();

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await api.endpoints.getShares(dashboardId)) as ShareToken[];
      setShares(data);
    } catch {
      enqueueSnackbar('Failed to load share links', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [dashboardId, enqueueSnackbar]);

  useEffect(() => {
    if (open) {
      loadShares();
      setNewShareUrl('');
      setNewEmbedUrl('');
    }
  }, [open, loadShares]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const result = (await api.endpoints.createShare(dashboardId, {
        expiresInHours: expiresInHours ? parseInt(expiresInHours) : null,
        allowEmbed,
      })) as CreateShareResponse;
      setNewShareUrl(result.shareUrl);
      setNewEmbedUrl(result.embedUrl);
      loadShares();
      enqueueSnackbar('Share link created', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to create share link', { variant: 'error' });
    } finally {
      setCreating(false);
    }
  }, [dashboardId, expiresInHours, allowEmbed, loadShares, enqueueSnackbar]);

  const handleRevoke = useCallback(
    async (id: number) => {
      try {
        await api.endpoints.revokeShare(id);
        loadShares();
        enqueueSnackbar('Share link revoked', { variant: 'success' });
      } catch {
        enqueueSnackbar('Failed to revoke share link', { variant: 'error' });
      }
    },
    [loadShares, enqueueSnackbar],
  );

  const copyToClipboard = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text);
      enqueueSnackbar('Copied to clipboard', { variant: 'info' });
    },
    [enqueueSnackbar],
  );

  const getEmbedCode = useCallback(
    (url: string) =>
      `<iframe src="${url}" width="100%" height="600" frameborder="0" style="border-radius: 8px;"></iframe>`,
    [],
  );

  const activeShares = shares.filter((s) => s.isActive);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinkIcon color="primary" />
          Share &quot;{dashboardName}&quot;
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {/* Create new share link */}
        <Typography variant="subtitle2" gutterBottom>
          Create Share Link
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="Expires in (hours)"
            type="number"
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            placeholder="Never"
            sx={{ width: 160 }}
            slotProps={{ htmlInput: { min: 1, max: 8760 } }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={allowEmbed}
                onChange={(e) => setAllowEmbed(e.target.checked)}
                size="small"
              />
            }
            label="Allow embed"
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleCreate}
            disabled={creating}
            startIcon={creating ? <CircularProgress size={16} /> : <LinkIcon />}
          >
            Create
          </Button>
        </Box>

        {/* Newly created link */}
        {newShareUrl && (
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Share URL:
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                fullWidth
                value={newShareUrl}
                slotProps={{ input: { readOnly: true } }}
              />
              <Tooltip title="Copy link">
                <IconButton size="small" onClick={() => copyToClipboard(newShareUrl)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            {newEmbedUrl && allowEmbed && (
              <>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  Embed Code:
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={getEmbedCode(newEmbedUrl)}
                    slotProps={{ input: { readOnly: true } }}
                    multiline
                    maxRows={2}
                  />
                  <Tooltip title="Copy embed code">
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(getEmbedCode(newEmbedUrl))}
                    >
                      <CodeIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </>
            )}
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Existing share links */}
        <Typography variant="subtitle2" gutterBottom>
          Active Share Links ({activeShares.length})
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : activeShares.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No active share links
          </Typography>
        ) : (
          <List dense>
            {activeShares.map((share) => (
              <ListItem
                key={share.id}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  bgcolor: (theme) => alpha(theme.palette.background.paper, 0.5),
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontFamily="monospace">
                        ...{share.token.substring(share.token.length - 12)}
                      </Typography>
                      {share.allowEmbed && <Chip label="Embed" size="small" color="info" />}
                    </Box>
                  }
                  secondary={
                    share.expiresAt
                      ? `Expires: ${new Date(share.expiresAt).toLocaleDateString()}`
                      : 'Never expires'
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Revoke">
                    <IconButton edge="end" size="small" onClick={() => handleRevoke(share.id)}>
                      <DeleteIcon fontSize="small" color="error" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
