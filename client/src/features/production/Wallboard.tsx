import { translate as t, useLanguage } from '@/i18n';
import LiveState from './LiveState';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { MachineLiveSummary } from '@performance-dashboard/shared';
import { useAuthStore } from '@/stores/useAuthStore';
import { api } from '@/utils/api';
import { API_BASE_URL } from '@/config/config';
import { productionRequest } from './CommissioningPanel';

/**
 *
 */
export default function Wallboard() {
  useLanguage((s) => s.language);
  const root = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [selected, setSelected] = useState<number[]>([]);
  const [rotate, setRotate] = useState(true);
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [account, setAccount] = useState({ username: '', email: '', password: '' });
  const [accountMessage, setAccountMessage] = useState('');
  const assets = useQuery({
    queryKey: ['production-assets'],
    queryFn: () => productionRequest<{ id: number; name: string }[]>('/assets'),
  });
  const ids = selected.length ? selected : (assets.data?.map((asset) => asset.id) ?? []);
  const pages = Math.max(1, Math.ceil(ids.length / 6));
  const visible = ids.slice((page % pages) * 6, ((page % pages) + 1) * 6);
  const live = useQuery({
    queryKey: ['wallboard', visible.join(',')],
    queryFn: () =>
      productionRequest<{ checkedAt: string; machines: MachineLiveSummary[] }>(
        `/operator/live?ids=${visible.join(',')}`,
      ),
    enabled: visible.length > 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    retry: 1,
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!rotate || pages < 2) return;
    const timer = setInterval(() => setPage((value) => (value + 1) % pages), 30000);
    return () => clearInterval(timer);
  }, [rotate, pages]);
  const stale = !live.data || now - live.dataUpdatedAt > 15000 || !!live.error;
  return (
    <Box
      ref={root}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        bgcolor: 'background.default',
        overflow: 'auto',
        p: { xs: 2, md: 3 },
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" flexWrap="wrap" gap={2} alignItems="center">
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            {t('Production wallboard')}{' '}
          </Typography>
          <Button
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await root.current?.requestFullscreen();
              } catch {
                setError('Fullscreen is unavailable in this browser.');
              }
            }}
          >
            {t('Toggle fullscreen')}{' '}
          </Button>
          {user?.role !== 'wallboard' && (
            <Button component={Link} to="/production">
              {t('Back to workspace')}{' '}
            </Button>
          )}
          <Button onClick={() => void logout()}>{t('Sign out')} </Button>
        </Stack>
        <TextField
          select
          label={t('Wallboard machines (empty means all)')}
          value={selected}
          slotProps={{ select: { multiple: true } }}
          onChange={(event) => {
            const value = event.target.value;
            setSelected(
              (typeof value === 'string' ? value.split(',') : (value as number[])).map(Number),
            );
            setPage(0);
          }}
        >
          {assets.data?.map((asset) => (
            <MenuItem key={asset.id} value={asset.id}>
              {asset.name}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction="row" flexWrap="wrap" alignItems="center" gap={2}>
          <FormControlLabel
            control={<Checkbox checked={rotate} onChange={(e) => setRotate(e.target.checked)} />}
            label={t('Rotate every 30 seconds')}
          />
          <Button onClick={() => setPage((value) => (value + 1) % pages)} disabled={pages < 2}>
            {t('Next machines (')}
            {(page % pages) + 1}/{pages})
          </Button>
          <Typography>
            {t('Updated')} {live.data ? new Date(live.data.checkedAt).toLocaleTimeString() : '—'}
          </Typography>
        </Stack>
        {(error || assets.error) && <Alert severity="error">{error || String(assets.error)}</Alert>}
        {stale && (
          <Alert severity="warning">
            {t(
              'Live status unavailable or overdue. Displayed measurements are historical; current machine state is unknown.',
            )}{' '}
          </Alert>
        )}
        {!ids.length && !assets.isLoading && (
          <Alert severity="info">{t('No machines configured.')} </Alert>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, minmax(0, 1fr))',
              xl: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 2,
          }}
        >
          {live.data?.machines.map((machine) => (
            <Paper
              key={machine.id}
              variant="outlined"
              sx={{
                p: 3,
                borderTop: 6,
                borderTopColor:
                  stale || machine.state === 'unknown'
                    ? 'warning.main'
                    : machine.state === 'fault'
                      ? 'error.main'
                      : machine.state === 'running'
                        ? 'success.main'
                        : 'info.main',
              }}
            >
              <Typography variant="h5" sx={{ overflowWrap: 'anywhere' }}>
                {machine.name}
              </Typography>
              <LiveState
                machine={machine}
                updatedAt={live.dataUpdatedAt}
                failed={!!live.error}
                large
              />
              <Typography variant="body2">
                {t('Last measurement:')}{' '}
                {machine.lastMeasurement
                  ? new Date(machine.lastMeasurement).toLocaleString(
                      useLanguage.getState().language,
                    )
                  : t('None')}
              </Typography>
              <Typography variant="h6" sx={{ mt: 2 }}>
                {machine.shift?.job.reference || 'No active work order'}
              </Typography>
              <Typography>
                {machine.shift?.job.product} {machine.shift ? `· ${machine.shift.name}` : ''}
              </Typography>
              <Typography variant="h5">
                {machine.production.observed?.toLocaleString(useLanguage.getState().language) ??
                  'Unknown'}{' '}
                /{' '}
                {machine.shift?.job.target?.toLocaleString(useLanguage.getState().language) ?? '—'}{' '}
                {t('target')}{' '}
              </Typography>
              <Typography variant="body2">
                {machine.production.truncated
                  ? t('Progress unavailable: sample limit reached')
                  : machine.production.complete
                    ? t('Observed production')
                    : t('Partial observed production; gaps or incomplete boundaries')}
              </Typography>
              {machine.production.asOf && (
                <Typography variant="body2">
                  {t('Counts through')} {new Date(machine.production.asOf).toLocaleTimeString()}
                </Typography>
              )}
              <Stack spacing={1} sx={{ mt: 2 }}>
                {machine.issues.map((issue) => (
                  <Alert
                    key={issue.id}
                    severity={issue.priority === 'high' ? 'warning' : 'info'}
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {issue.priority === 'high' ? t('HIGH · ') : ''}
                    {issue.text}
                    {issue.dueAt
                      ? ` · Due ${new Date(issue.dueAt).toLocaleString(useLanguage.getState().language)}`
                      : ''}
                  </Alert>
                ))}
                {!machine.issues.length && (
                  <Typography>{t('No outstanding handover items.')} </Typography>
                )}
              </Stack>
            </Paper>
          ))}
        </Box>
        {user?.role === 'admin' && !user.recoveryMode && (
          <Box component="details">
            <summary>{t('Create a read-only display account')} </summary>
            <Stack
              component="form"
              spacing={2}
              sx={{ my: 2, maxWidth: 480 }}
              onSubmit={async (event) => {
                event.preventDefault();
                setAccountMessage('');
                try {
                  const created = (await api.post(`${API_BASE_URL}/auth/register`, {
                    ...account,
                    role: 'wallboard',
                  })) as { user: { id: number } };
                  await api.put(`${API_BASE_URL}/access/users/${created.user.id}`, {
                    machineIds: ids,
                    plantIds: [],
                  });
                  setAccount({ username: '', email: '', password: '' });
                  setAccountMessage(
                    'Display account created. Sign in on the wall display using that account.',
                  );
                } catch (failure) {
                  setAccountMessage(String(failure));
                }
              }}
            >
              <TextField
                required
                label={t('Display username')}
                helperText={t('Letters and numbers only, 3–50 characters')}
                value={account.username}
                onChange={(e) => setAccount({ ...account, username: e.target.value })}
              />
              <TextField
                required
                type="email"
                label={t('Display email')}
                value={account.email}
                onChange={(e) => setAccount({ ...account, email: e.target.value })}
              />
              <TextField
                required
                type="password"
                autoComplete="new-password"
                label={t('Display password')}
                value={account.password}
                onChange={(e) => setAccount({ ...account, password: e.target.value })}
              />
              <Button type="submit" variant="contained">
                {t('Create display account')}{' '}
              </Button>
              {accountMessage && <Typography role="status">{accountMessage}</Typography>}
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
