import { translate as t, useLanguage } from '@/i18n';
import React, { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_BASE_URL } from '@/config/config';

type MappedRole = 'wallboard' | 'viewer' | 'operator' | 'supervisor';
interface Mapping {
  groupName: string;
  role: MappedRole;
  plantIds: number[];
}
interface Token {
  id: number;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}
interface ServiceAccount {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  machines: { id: number; name: string }[];
  tokens: Token[];
}
const tokenState = (token: Token) =>
  token.revokedAt
    ? t('revoked', 'widerrufen')
    : new Date(token.expiresAt) < new Date()
      ? t('expired', 'abgelaufen')
      : t('active', 'aktiv');

/**
 * E02: identity-provider group mappings and read-only service accounts.
 * @param root0
 * @param root0.sites
 * @param root0.assets
 */
export default function IdentityPanel({
  sites,
  assets,
}: {
  sites: { id: number; name: string }[];
  assets: { id: number; name: string }[];
}) {
  const language = useLanguage((s) => s.language);
  const mappings = useQuery({
    queryKey: ['identity-group-mappings'],
    queryFn: () => api.get(`${API_BASE_URL}/identity/group-mappings`) as Promise<Mapping[]>,
  });
  const accounts = useQuery({
    queryKey: ['identity-service-accounts'],
    queryFn: () =>
      api.get(`${API_BASE_URL}/identity/service-accounts`) as Promise<ServiceAccount[]>,
  });
  const [draft, setDraft] = useState<Mapping[] | null>(null);
  const rows = draft ?? mappings.data ?? [];
  const [account, setAccount] = useState({
    username: '',
    role: 'viewer',
    machineIds: [] as number[],
    expiresInDays: 90,
  });
  const [issued, setIssued] = useState<{ username: string; token: string } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: done });
    } catch (error) {
      setMessage({ ok: false, text: String(error instanceof Error ? error.message : error) });
    }
  };
  const update = (index: number, patch: Partial<Mapping>) =>
    setDraft(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Stack spacing={3}>
      {message && <Alert severity={message.ok ? 'success' : 'error'}>{message.text}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {t('Single sign-on group mappings', 'Gruppenzuordnung für Single Sign-on')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(
              'An identity-provider group grants a role and sites at each sign-in; the highest role applies. Administrator rights are never granted by a group. An account without a mapped group cannot sign in.',
              'Eine Gruppe des Identitätsanbieters gewährt bei jeder Anmeldung eine Rolle und Standorte; die höchste Rolle gilt. Administratorrechte werden nie über eine Gruppe vergeben. Ein Konto ohne zugeordnete Gruppe kann sich nicht anmelden.',
            )}
          </Typography>
          {rows.map((row, index) => (
            <Stack key={index} direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                label={t('Group', 'Gruppe')}
                value={row.groupName}
                onChange={(e) => update(index, { groupName: e.target.value })}
              />
              <TextField
                select
                label={t('Role', 'Rolle')}
                value={row.role}
                onChange={(e) => update(index, { role: e.target.value as MappedRole })}
                sx={{ minWidth: 160 }}
              >
                {['wallboard', 'viewer', 'operator', 'supervisor'].map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </TextField>
              <Autocomplete
                multiple
                options={sites}
                getOptionLabel={(site) => site.name}
                value={sites.filter((site) => row.plantIds.includes(site.id))}
                onChange={(_, value) => update(index, { plantIds: value.map((site) => site.id) })}
                renderInput={(params) => <TextField {...params} label={t('Sites', 'Standorte')} />}
                sx={{ minWidth: 240, flex: 1 }}
              />
              <Button onClick={() => setDraft(rows.filter((_, i) => i !== index))}>
                {t('Remove', 'Entfernen')}
              </Button>
            </Stack>
          ))}
          <Stack direction="row" spacing={1}>
            <Button
              onClick={() => setDraft([...rows, { groupName: '', role: 'viewer', plantIds: [] }])}
            >
              {t('Add group mapping', 'Gruppenzuordnung hinzufügen')}
            </Button>
            <Button
              variant="contained"
              disabled={!draft || draft.some((row) => !row.groupName.trim())}
              onClick={() =>
                void run(
                  async () => {
                    await api.put(`${API_BASE_URL}/identity/group-mappings`, { mappings: rows });
                    setDraft(null);
                    await mappings.refetch();
                  },
                  t('Group mappings saved.', 'Gruppenzuordnungen gespeichert.'),
                )
              }
            >
              {t('Save group mappings', 'Gruppenzuordnungen speichern')}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {t('Service accounts', 'Dienstkonten')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(
              "A service account reads the integration API's read endpoints for its machines with an expiring token. It cannot sign in or change anything. The token is shown once.",
              'Ein Dienstkonto liest mit einem ablaufenden Token die Lese-Endpunkte der Integrations-API für seine Maschinen. Es kann sich nicht anmelden und nichts ändern. Das Token wird einmal angezeigt.',
            )}
          </Typography>
          {issued && (
            <Alert severity="warning" onClose={() => setIssued(null)}>
              {t('Copy the token for', 'Token kopieren für')} {issued.username}{' '}
              {t('now; it is not shown again:', 'jetzt; es wird nicht erneut angezeigt:')}
              <Box component="code" sx={{ display: 'block', mt: 1, wordBreak: 'break-all' }}>
                {issued.token}
              </Box>
            </Alert>
          )}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField
              label={t('Service account name', 'Name des Dienstkontos')}
              value={account.username}
              onChange={(e) => setAccount({ ...account, username: e.target.value })}
            />
            <TextField
              select
              label={t('Service account role', 'Rolle des Dienstkontos')}
              value={account.role}
              onChange={(e) => setAccount({ ...account, role: e.target.value })}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="viewer">viewer</MenuItem>
              <MenuItem value="supervisor">supervisor</MenuItem>
            </TextField>
            <Autocomplete
              multiple
              options={assets}
              getOptionLabel={(asset) => asset.name}
              value={assets.filter((asset) => account.machineIds.includes(asset.id))}
              onChange={(_, value) =>
                setAccount({ ...account, machineIds: value.map((asset) => asset.id) })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('Service account machines', 'Maschinen des Dienstkontos')}
                />
              )}
              sx={{ minWidth: 240, flex: 1 }}
            />
            <TextField
              type="number"
              label={t('Token valid for days', 'Token gültig (Tage)')}
              value={account.expiresInDays}
              onChange={(e) => setAccount({ ...account, expiresInDays: Number(e.target.value) })}
              slotProps={{ htmlInput: { min: 1, max: 365 } }}
            />
          </Stack>
          <Button
            sx={{ alignSelf: 'flex-start' }}
            variant="contained"
            disabled={!account.username || !account.machineIds.length}
            onClick={() =>
              void run(
                async () => {
                  const created = (await api.post(
                    `${API_BASE_URL}/identity/service-accounts`,
                    account,
                  )) as { username: string; token: { token: string } };
                  setIssued({ username: created.username, token: created.token.token });
                  setAccount({ ...account, username: '', machineIds: [] });
                  await accounts.refetch();
                },
                t('Service account created.', 'Dienstkonto angelegt.'),
              )
            }
          >
            {t('Create service account', 'Dienstkonto anlegen')}
          </Button>
          {accounts.data?.map((service) => (
            <Box key={service.id} sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
              <Typography fontWeight={600}>
                {service.username} · {service.role}
                {!service.isActive && ` · ${t('deactivated', 'deaktiviert')}`}
              </Typography>
              <Typography variant="body2">
                {service.machines.map((machine) => machine.name).join(', ')}
              </Typography>
              {service.tokens.map((token) => (
                <Stack key={token.id} direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2">
                    {t('Token', 'Token')} {token.id} · {tokenState(token)} ·{' '}
                    {t('expires', 'läuft ab')}{' '}
                    {new Date(token.expiresAt).toLocaleDateString(language)} ·{' '}
                    {t('last used', 'zuletzt benutzt')}{' '}
                    {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString(language) : '–'}
                  </Typography>
                  {!token.revokedAt && (
                    <Button
                      size="small"
                      onClick={() =>
                        void run(
                          async () => {
                            await api.post(
                              `${API_BASE_URL}/identity/service-tokens/${token.id}/revoke`,
                            );
                            await accounts.refetch();
                          },
                          t('Token revoked.', 'Token widerrufen.'),
                        )
                      }
                    >
                      {t('Revoke token', 'Token widerrufen')} {token.id}
                    </Button>
                  )}
                </Stack>
              ))}
              <Button
                size="small"
                onClick={() =>
                  void run(
                    async () => {
                      const token = (await api.post(
                        `${API_BASE_URL}/identity/service-accounts/${service.id}/tokens`,
                        { expiresInDays: account.expiresInDays },
                      )) as { token: string };
                      setIssued({ username: service.username, token: token.token });
                      await accounts.refetch();
                    },
                    t('New token issued.', 'Neues Token ausgestellt.'),
                  )
                }
              >
                {t('Issue new token for', 'Neues Token für')} {service.username}
              </Button>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
