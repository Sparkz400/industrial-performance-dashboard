import { translate as t, useLanguage } from '@/i18n';
import React, { useState } from 'react';
import {
  Alert,
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
import { api } from '@/utils/api';
import { API_BASE_URL } from '@/config/config';
import type { UserRole } from '@performance-dashboard/shared';
import IdentityPanel from './IdentityPanel';

interface Configuration {
  accounts: { id: number; username: string; role: UserRole; isActive: boolean }[];
  assets: { id: number; name: string }[];
  sites: { id: number; name: string }[];
  grants: { userId: number; machineId: number }[];
  memberships: { userId: number; plantId: number }[];
  assignments: { machineId: number; plantId: number }[];
  views: { id: string; name: string }[];
  viewGrants: { dashboardId: string; machineId: number }[];
}
/**
 *
 */
export default function AccessTab() {
  useLanguage((s) => s.language);
  const configuration = useQuery({
    queryKey: ['access-configuration'],
    queryFn: () => api.get(`${API_BASE_URL}/access/configuration`) as Promise<Configuration>,
  });
  const [selected, setSelected] = useState('');
  const [machineIds, setMachineIds] = useState<number[]>([]),
    [plantIds, setPlantIds] = useState<number[]>([]);
  const [role, setRole] = useState<UserRole>('viewer');
  const [active, setActive] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [draft, setDraft] = useState({
    username: '',
    email: '',
    password: '',
    role: 'viewer' as UserRole,
  });
  const [dashboard, setDashboard] = useState(''),
    [viewAssets, setViewAssets] = useState<number[]>([]);
  const data = configuration.data;
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await configuration.refetch();
      setMessage('Saved. Affected accounts must sign in again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (values: number[], id: number) =>
    values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
  if (configuration.error) return <Alert severity="error">{String(configuration.error)}</Alert>;
  if (!data) return <Typography role="status">{t('Loading access settings…')} </Typography>;
  return (
    <Stack spacing={3}>
      <Typography variant="h5">{t('People and machine access')} </Typography>
      <Alert severity="info">
        {t(
          'Administrators manage the installation. Supervisors plan and review production. Operators record actions and acknowledge alarms. Viewers and wallboards are read-only. New accounts have no machine access until assigned. Site membership grants access to machines assigned to that site.',
        )}{' '}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert severity="success" role="status">
          {message}
        </Alert>
      )}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('Create account')} </Typography>
          {[
            ['username', draft.username, 'New account username', 'Benutzername für neues Konto'],
            ['email', draft.email, 'New account email', 'E-Mail für neues Konto'],
            ['password', draft.password, 'New account password', 'Passwort für neues Konto'],
          ].map(([key, value, english, german]) => (
            <TextField
              key={key}
              label={t(english, german)}
              type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'}
              autoComplete={key === 'password' ? 'new-password' : 'off'}
              value={value}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          ))}
          <TextField
            select
            label={t('New account role')}
            value={draft.role}
            onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}
          >
            {['viewer', 'operator', 'supervisor', 'wallboard', 'admin'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <Button
            disabled={busy || !draft.username || !draft.email || draft.password.length < 12}
            onClick={() =>
              void run(async () => {
                await api.post(`${API_BASE_URL}/auth/register`, draft);
                setDraft({ username: '', email: '', password: '', role: 'viewer' });
              })
            }
          >
            {t('Create account')}{' '}
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            select
            label={t('Account to manage')}
            value={selected}
            onChange={(event) => {
              const id = Number(event.target.value),
                user = data.accounts.find((account) => account.id === id)!;
              setSelected(String(id));
              setRole(user.role);
              setActive(user.isActive);
              setMachineIds(
                data.grants.filter((grant) => grant.userId === id).map((grant) => grant.machineId),
              );
              setPlantIds(
                data.memberships
                  .filter((grant) => grant.userId === id)
                  .map((grant) => grant.plantId),
              );
            }}
          >
            {data.accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>
                {account.username}
              </MenuItem>
            ))}
          </TextField>
          {selected && (
            <>
              <TextField
                select
                label={t('Account role')}
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                {['viewer', 'operator', 'supervisor', 'wallboard', 'admin'].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                label={t('Account active')}
                control={
                  <Checkbox
                    checked={active}
                    onChange={(event) => setActive(event.target.checked)}
                  />
                }
              />
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    api.put(`${API_BASE_URL}/auth/users/${selected}`, { role, isActive: active }),
                  )
                }
              >
                {t('Save role and account status')}{' '}
              </Button>
              <Typography variant="h6">{t('Direct machine access')} </Typography>
              {data.assets.map((asset) => (
                <FormControlLabel
                  key={asset.id}
                  label={asset.name}
                  control={
                    <Checkbox
                      checked={machineIds.includes(asset.id)}
                      onChange={() => setMachineIds(toggle(machineIds, asset.id))}
                    />
                  }
                />
              ))}
              <Typography variant="h6">{t('Site access')} </Typography>
              {data.sites.map((site) => (
                <FormControlLabel
                  key={site.id}
                  label={site.name}
                  control={
                    <Checkbox
                      checked={plantIds.includes(site.id)}
                      onChange={() => setPlantIds(toggle(plantIds, site.id))}
                    />
                  }
                />
              ))}
              <Button
                disabled={busy || role === 'admin'}
                onClick={() =>
                  void run(() =>
                    api.put(`${API_BASE_URL}/access/users/${selected}`, { machineIds, plantIds }),
                  )
                }
              >
                {t('Save machine and site access')}{' '}
              </Button>
            </>
          )}
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('Assign machines to sites')} </Typography>
          {data.assets.map((asset) => (
            <TextField
              key={asset.id}
              select
              label={`Site for ${asset.name}`}
              disabled={busy}
              value={data.assignments.find((item) => item.machineId === asset.id)?.plantId ?? ''}
              onChange={(event) =>
                void run(() =>
                  api.put(`${API_BASE_URL}/access/machines/${asset.id}/site`, {
                    plantId: event.target.value ? Number(event.target.value) : null,
                  }),
                )
              }
            >
              <MenuItem value="">{t('No site')} </MenuItem>
              {data.sites.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name}
                </MenuItem>
              ))}
            </TextField>
          ))}
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('Dashboard visibility')} </Typography>
          <Typography>
            {t(
              'Only accounts with every selected machine can open this dashboard. With no selection, only administrators can open it. Individual widgets still enforce machine access.',
            )}{' '}
          </Typography>
          <TextField
            select
            label={t('Dashboard to scope')}
            value={dashboard}
            onChange={(event) => {
              setDashboard(event.target.value);
              setViewAssets(
                data.viewGrants
                  .filter((item) => item.dashboardId === event.target.value)
                  .map((item) => item.machineId),
              );
            }}
          >
            {data.views.map((view) => (
              <MenuItem key={view.id} value={view.id}>
                {view.name}
              </MenuItem>
            ))}
          </TextField>
          {dashboard &&
            data.assets.map((asset) => (
              <FormControlLabel
                key={asset.id}
                label={`Dashboard uses ${asset.name}`}
                control={
                  <Checkbox
                    checked={viewAssets.includes(asset.id)}
                    onChange={() => setViewAssets(toggle(viewAssets, asset.id))}
                  />
                }
              />
            ))}
          <Button
            disabled={busy || !dashboard}
            onClick={() =>
              void run(() =>
                api.put(`${API_BASE_URL}/access/dashboards/${encodeURIComponent(dashboard)}`, {
                  machineIds: viewAssets,
                }),
              )
            }
          >
            {t('Save dashboard access')}{' '}
          </Button>
        </Stack>
      </Paper>
      {configuration.data && (
        <IdentityPanel sites={configuration.data.sites} assets={configuration.data.assets} />
      )}
    </Stack>
  );
}
