import React, { useState } from 'react';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { translate as t } from '@/i18n';
import { api } from '@/utils/api';
import { API_BASE_URL } from '@/config/config';

interface Source {
  id: number;
  name: string;
  brokerUrl: string;
  username: string | null;
  clientId: string;
  mappings: { topic: string; nodeKey: string }[];
  isActive: boolean;
  status: {
    state: string;
    lastMessageAt?: string | null;
    accepted?: number;
    rejected?: number;
    lastRejection?: string | null;
    lastError?: string | null;
  } | null;
}
const example = JSON.stringify(
  [
    {
      topic: 'plant/line1/press',
      nodeKey: 'Pressure',
      valuePointer: '/value',
      timestampPointer: '/ts',
      dataType: 'Double',
    },
  ],
  null,
  2,
);
const empty = {
  name: '',
  brokerUrl: 'mqtts://',
  caCertificate: '',
  username: '',
  password: '',
  mappings: example,
};

/**
 * Read-only MQTT sources of a machine: a TLS broker, a pinned CA and exact topic mappings.
 * @param root0
 * @param root0.machines
 */
export default function MqttSourcesPanel({
  machines,
}: {
  machines: { id: number; name: string }[];
}) {
  const [machine, setMachine] = useState(''),
    [form, setForm] = useState(empty),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const base = `${API_BASE_URL}/mqtt`;
  const sources = useQuery({
    queryKey: ['mqtt-sources', machine],
    queryFn: () => api.get(`${base}/machines/${machine}/sources`) as Promise<Source[]>,
    enabled: !!machine,
    refetchInterval: 5000,
  });
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await sources.refetch();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">{t('MQTT sources (read-only)')}</Typography>
        <Typography variant="body2">
          {t(
            'The collector subscribes to exact topics over TLS with a pinned CA and never publishes. A message is acknowledged only after its readings are stored; one without a source timestamp is refused, and a value of the wrong type is stored as bad. Use a broker identity that may only subscribe to these topics.',
          )}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          select
          label={t('MQTT machine')}
          value={machine}
          onChange={(e) => setMachine(e.target.value)}
          sx={{ maxWidth: 320 }}
        >
          {machines.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.name}
            </MenuItem>
          ))}
        </TextField>
        {sources.data?.map((s) => (
          <Stack key={s.id} spacing={0.5} sx={{ borderLeft: 3, borderColor: 'divider', pl: 1 }}>
            <Typography
              sx={{
                fontWeight: 700,
              }}
            >
              {s.name} · {s.brokerUrl} ·{' '}
              {s.mappings.map((m) => `${m.topic} → ${m.nodeKey}`).join(', ')}
            </Typography>
            <Typography variant="body2" role="status">
              {s.isActive ? (s.status?.state ?? t('not started')) : t('disabled')}
              {s.status?.accepted != null
                ? ` · ${t('readings received')}: ${s.status.accepted} ${t('(repeats are stored once)')} · ${t('refused messages')}: ${s.status.rejected}`
                : ''}
              {s.status?.lastRejection ? ` · ${t('last refusal:')} ${s.status.lastRejection}` : ''}
              {s.status?.lastError ? ` · ${t('error:')} ${s.status.lastError}` : ''}
            </Typography>
            <Button
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              disabled={busy}
              onClick={() =>
                void run(() => api.patch(`${base}/sources/${s.id}`, { isActive: !s.isActive }))
              }
            >
              {s.isActive ? t('Disable source') : t('Enable source')} {s.name}
            </Button>
          </Stack>
        ))}
        {machine && (
          <Stack spacing={2}>
            <TextField
              label={t('Source name')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label={t('Broker URL (mqtts only)')}
              value={form.brokerUrl}
              onChange={(e) => setForm({ ...form, brokerUrl: e.target.value })}
            />
            <TextField
              label={t('Broker CA certificate (PEM)')}
              multiline
              minRows={3}
              value={form.caCertificate}
              onChange={(e) => setForm({ ...form, caCertificate: e.target.value })}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={t('Subscribe-only user')}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <TextField
                label={t('Broker password')}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Stack>
            <TextField
              label={t('Topic mappings (JSON)')}
              multiline
              minRows={6}
              value={form.mappings}
              onChange={(e) => setForm({ ...form, mappings: e.target.value })}
              slotProps={{ htmlInput: { spellCheck: false } }}
            />
            <Button
              variant="contained"
              disabled={busy || !form.name || !form.caCertificate}
              onClick={() =>
                void run(async () => {
                  await api.post(`${base}/machines/${machine}/sources`, {
                    name: form.name,
                    brokerUrl: form.brokerUrl,
                    caCertificate: form.caCertificate,
                    username: form.username || null,
                    password: form.password || null,
                    mappings: JSON.parse(form.mappings),
                  });
                  setForm(empty);
                })
              }
            >
              {t('Add MQTT source')}
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
