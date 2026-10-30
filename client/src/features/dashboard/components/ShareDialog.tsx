import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { SharedLink, Widget } from '@performance-dashboard/shared';
import { api } from '@/utils/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useT } from '@/i18n';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  dashboardName: string;
  widgets: Widget[];
}

const LIFETIMES = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
];
const WINDOWS = [1, 8, 24, 168];

/**
 * Only saved trend widgets with one machine and explicit signals can be shared.
 * @param widget
 */
function shareableWidget(widget: Widget) {
  const tags = widget.config?.defaultTags;
  return (
    widget.type === 'trendingExplorer' &&
    Number.isSafeInteger(widget.config?.machineId) &&
    Array.isArray(tags) &&
    tags.length > 0 &&
    tags.length <= 32
  );
}

const widgetTitle = (widget: Widget) => String(widget.config?.title || 'Trend');

/**
 * Administrators create expiring read-only links to selected trend widgets.
 * @param root0
 * @param root0.open
 * @param root0.onClose
 * @param root0.dashboardId
 * @param root0.dashboardName
 * @param root0.widgets
 */
export default function ShareDialog({
  open,
  onClose,
  dashboardId,
  dashboardName,
  widgets,
}: ShareDialogProps) {
  const t = useT();
  const admin = useAuthStore((s) => s.user?.role === 'admin');
  const candidates = useMemo(() => widgets.filter(shareableWidget), [widgets]);
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(7);
  const [windowHours, setWindowHours] = useState(8);
  const [allowEmbed, setAllowEmbed] = useState(false);
  const [origins, setOrigins] = useState('');
  const [created, setCreated] = useState<{ token: string; embed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!admin) return;
    try {
      setLinks(await api.endpoints.getShares(dashboardId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [admin, dashboardId]);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setError(null);
    setSelected([]);
    void load();
  }, [open, load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.endpoints.createShare(dashboardId, {
        widgetIds: selected,
        label,
        expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
        windowHours,
        allowEmbed,
        allowedOrigins: allowEmbed
          ? origins
              .split(/[\s,]+/)
              .map((origin) => origin.trim())
              .filter(Boolean)
          : [],
      });
      setCreated({ token: result.token, embed: allowEmbed });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    setError(null);
    try {
      await api.endpoints.revokeShare(id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const url = (path: string, token: string) => `${window.location.origin}/${path}/${token}`;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {t('Share')} {dashboardName}
      </DialogTitle>
      <DialogContent>
        {!admin ? (
          <Alert severity="info">{t('Only administrators can create read-only links.')}</Alert>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">
              {t(
                'Anyone with the link can view the selected signals, without signing in, until it expires or is revoked. Other widgets, machines and settings are not included.',
              )}
            </Alert>
            {error && <Alert severity="error">{error}</Alert>}
            {created ? (
              <Alert severity="success" sx={{ '& .MuiAlert-message': { width: '100%' } }}>
                <Typography variant="body2" gutterBottom>
                  {t('Copy the link now. It is shown only once.')}
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label={t('Read-only link')}
                  value={url('shared', created.token)}
                  slotProps={{ input: { readOnly: true } }}
                  onFocus={(event) => event.target.select()}
                />
                {created.embed && (
                  <TextField
                    fullWidth
                    size="small"
                    sx={{ mt: 1 }}
                    label={t('Embed address')}
                    value={url('embed', created.token)}
                    slotProps={{ input: { readOnly: true } }}
                    onFocus={(event) => event.target.select()}
                  />
                )}
              </Alert>
            ) : candidates.length === 0 ? (
              <Alert severity="info">
                {t('Save a trend widget with a machine and signals to share it.')}
              </Alert>
            ) : (
              <>
                <Box role="group" aria-label={t('Widgets to share')}>
                  {candidates.map((widget) => (
                    <FormControlLabel
                      key={widget.id}
                      control={
                        <Checkbox
                          checked={selected.includes(widget.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, widget.id]
                                : current.filter((id) => id !== widget.id),
                            )
                          }
                        />
                      }
                      label={`${widgetTitle(widget)} · ${(widget.config.defaultTags as string[]).join(', ')}`}
                    />
                  ))}
                </Box>
                <TextField
                  size="small"
                  label={t('Label (optional)')}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="share-lifetime">{t('Link expires after')}</InputLabel>
                    <Select
                      labelId="share-lifetime"
                      label={t('Link expires after')}
                      value={days}
                      onChange={(event) => setDays(Number(event.target.value))}
                    >
                      {LIFETIMES.map((option) => (
                        <MenuItem key={option.days} value={option.days}>
                          {t(option.label)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="share-window">{t('Visible history')}</InputLabel>
                    <Select
                      labelId="share-window"
                      label={t('Visible history')}
                      value={windowHours}
                      onChange={(event) => setWindowHours(Number(event.target.value))}
                    >
                      {WINDOWS.map((hours) => (
                        <MenuItem key={hours} value={hours}>
                          {t('Last')} {hours} h
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={allowEmbed}
                      onChange={(event) => setAllowEmbed(event.target.checked)}
                    />
                  }
                  label={t('Allow embedding on listed sites')}
                />
                {allowEmbed && (
                  <TextField
                    size="small"
                    label={t('Allowed embedding origins')}
                    helperText={t(
                      'Exact origins, for example https://intranet.example. Up to five.',
                    )}
                    value={origins}
                    onChange={(event) => setOrigins(event.target.value)}
                    multiline
                    minRows={2}
                  />
                )}
              </>
            )}
            <Typography variant="subtitle2">{t('Existing links')}</Typography>
            {links.length === 0 ? (
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('No links for this dashboard.')}
              </Typography>
            ) : (
              <List dense disablePadding>
                {links.map((link) => (
                  <ListItem
                    key={link.id}
                    disableGutters
                    secondaryAction={
                      ['active', 'legacy'].includes(link.status) ? (
                        <Button size="small" color="error" onClick={() => void revoke(link.id)}>
                          {t('Revoke')}
                        </Button>
                      ) : undefined
                    }
                  >
                    <ListItemText
                      primary={
                        <>
                          {link.label ||
                            link.widgets.map((w) => w.title).join(', ') ||
                            `#${link.id}`}{' '}
                          <Chip size="small" label={t(link.status)} />
                        </>
                      }
                      secondary={
                        link.status === 'legacy'
                          ? t('Retired link from the earlier design; it cannot show data.')
                          : `${t('Expires')} ${link.expiresAt ? new Date(link.expiresAt).toLocaleString() : '—'}${
                              link.allowEmbed
                                ? ` · ${t('Embeds')}: ${link.allowedOrigins.join(', ')}`
                                : ''
                            }`
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Close')}</Button>
        {admin && !created && candidates.length > 0 && (
          <Button variant="contained" disabled={busy || selected.length === 0} onClick={create}>
            {t('Create link')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
