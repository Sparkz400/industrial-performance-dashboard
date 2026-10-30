import { translate as t, useLanguage } from '@/i18n';
import React, { useState } from 'react';
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_BASE_URL } from '@/config/config';

interface Link {
  linked: boolean;
  edgeName?: string;
  centralUrl?: string;
  cursor?: number;
  backlog?: number;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  configRevision?: number;
  settings?: Record<string, unknown>;
  configRejection?: string | null;
  softwareVersion?: string;
}
interface Edge {
  id: number;
  name: string;
  plantId: number;
  enrolled: boolean;
  enrollmentPending: boolean;
  revokedAt: string | null;
  lastContactAt: string | null;
  lastBatchAt: string | null;
  backlog: number | null;
  softwareVersion: string | null;
  targetVersion: string | null;
  appliedConfigRevision: number | null;
  configRejection: string | null;
  latestConfig: { revision: number; settings: Record<string, unknown> } | null;
}

/**
 * H08/E04: this installation's link to a central installation, and the edges enrolled here.
 */
export default function EdgeSettingsPanel() {
  const language = useLanguage((s) => s.language);
  const when = (value?: string | null) => (value ? new Date(value).toLocaleString(language) : '–');
  const link = useQuery({
    queryKey: ['edge-link'],
    queryFn: () => api.get(`${API_BASE_URL}/edge/link`) as Promise<Link>,
    refetchInterval: 10_000,
  });
  const edges = useQuery({
    queryKey: ['edges'],
    queryFn: () => api.get(`${API_BASE_URL}/edges`) as Promise<Edge[]>,
  });
  const sites = useQuery({
    queryKey: ['access-configuration'],
    queryFn: () =>
      api.get(`${API_BASE_URL}/access/configuration`) as Promise<{
        sites: { id: number; name: string }[];
      }>,
  });
  const [enrollment, setEnrollment] = useState({
    centralUrl: '',
    caCertificate: '',
    enrollmentCode: '',
  });
  const [draft, setDraft] = useState({ name: '', plantId: '' });
  const [code, setCode] = useState<{ name: string; code: string; expiresAt: string } | null>(null);
  const [revision, setRevision] = useState<Record<number, string>>({});
  const [target, setTarget] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: done });
      await Promise.all([link.refetch(), edges.refetch()]);
    } catch (error) {
      setMessage({ ok: false, text: String(error instanceof Error ? error.message : error) });
    }
  };
  const issued = (result: unknown) => {
    const r = result as { name: string; enrollment: { code: string; expiresAt: string } };
    setCode({ name: r.name, ...r.enrollment });
  };
  const status = link.data;

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      {message && <Alert severity={message.ok ? 'success' : 'error'}>{message.text}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {t('Link to a central installation', 'Verbindung zu einer zentralen Installation')}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            {t(
              'As an edge, this installation keeps collecting and serving its own data and sends committed measurements to the central installation. A batch counts as sent only when the central installation confirms it was stored; until then it is retried.',
              'Als Edge sammelt und zeigt diese Installation weiter ihre eigenen Daten und sendet gespeicherte Messwerte an die zentrale Installation. Ein Paket gilt erst als gesendet, wenn die zentrale Installation die Speicherung bestätigt; bis dahin wird es wiederholt.',
            )}
          </Typography>
          {status?.linked ? (
            <>
              <Typography role="status">
                {t('Linked as', 'Verbunden als')} {status.edgeName} → {status.centralUrl} ·{' '}
                {t('waiting readings', 'wartende Messwerte')}: {status.backlog} ·{' '}
                {t('last confirmed', 'zuletzt bestätigt')}: {when(status.lastSuccessAt)}
              </Typography>
              {status.lastError && <Alert severity="warning">{status.lastError}</Alert>}
              <Typography variant="body2">
                {t('Configuration revision', 'Konfigurationsrevision')} {status.configRevision}:{' '}
                {JSON.stringify(status.settings)} · {t('version', 'Version')}{' '}
                {status.softwareVersion}
              </Typography>
              {status.configRejection && <Alert severity="error">{status.configRejection}</Alert>}
              <Button
                sx={{ alignSelf: 'flex-start' }}
                color="warning"
                onClick={() =>
                  void run(
                    () => api.delete(`${API_BASE_URL}/edge/link`),
                    t(
                      'Link removed; local history is kept.',
                      'Verbindung entfernt; lokale Historie bleibt.',
                    ),
                  )
                }
              >
                {t('Remove link', 'Verbindung entfernen')}
              </Button>
            </>
          ) : (
            <>
              <TextField
                label={t(
                  'Central installation URL (https)',
                  'URL der zentralen Installation (https)',
                )}
                value={enrollment.centralUrl}
                onChange={(e) => setEnrollment({ ...enrollment, centralUrl: e.target.value })}
              />
              <TextField
                label={t('Central CA certificate (PEM)', 'CA-Zertifikat der Zentrale (PEM)')}
                multiline
                minRows={3}
                value={enrollment.caCertificate}
                onChange={(e) => setEnrollment({ ...enrollment, caCertificate: e.target.value })}
              />
              <TextField
                label={t('Enrollment code', 'Registrierungscode')}
                value={enrollment.enrollmentCode}
                onChange={(e) =>
                  setEnrollment({ ...enrollment, enrollmentCode: e.target.value.trim() })
                }
              />
              <Button
                sx={{ alignSelf: 'flex-start' }}
                variant="contained"
                disabled={
                  !enrollment.centralUrl || !enrollment.caCertificate || !enrollment.enrollmentCode
                }
                onClick={() =>
                  void run(
                    () => api.post(`${API_BASE_URL}/edge/link`, enrollment),
                    t('Linked.', 'Verbunden.'),
                  )
                }
              >
                {t('Enroll as edge', 'Als Edge registrieren')}
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {t('Edges of this installation', 'Edges dieser Installation')}
          </Typography>
          {code && (
            <Alert severity="warning" onClose={() => setCode(null)}>
              {t('Enrollment code for', 'Registrierungscode für')} {code.name},{' '}
              {t('valid until', 'gültig bis')} {when(code.expiresAt)}.{' '}
              {t('It is shown once:', 'Er wird einmal angezeigt:')}
              <Box component="code" sx={{ display: 'block', mt: 1, wordBreak: 'break-all' }}>
                {code.code}
              </Box>
            </Alert>
          )}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField
              label={t('Edge name', 'Edge-Name')}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <TextField
              select
              label={t('Edge site', 'Edge-Standort')}
              value={draft.plantId}
              onChange={(e) => setDraft({ ...draft, plantId: e.target.value })}
              sx={{ minWidth: 200 }}
            >
              {(sites.data?.sites ?? []).map((site) => (
                <MenuItem key={site.id} value={String(site.id)}>
                  {site.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              disabled={!draft.name || !draft.plantId}
              onClick={() =>
                void run(
                  async () => {
                    issued(
                      await api.post(`${API_BASE_URL}/edges`, {
                        name: draft.name,
                        plantId: Number(draft.plantId),
                      }),
                    );
                    setDraft({ name: '', plantId: '' });
                  },
                  t('Edge created.', 'Edge angelegt.'),
                )
              }
            >
              {t('Create edge', 'Edge anlegen')}
            </Button>
          </Stack>
          {edges.data?.map((edge) => (
            <Box key={edge.id} sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
              <Typography
                sx={{
                  fontWeight: 600,
                }}
              >
                {edge.name} ·{' '}
                {edge.revokedAt
                  ? t('revoked', 'widerrufen')
                  : edge.enrolled
                    ? t('enrolled', 'registriert')
                    : t('waiting for enrollment', 'wartet auf Registrierung')}
              </Typography>
              <Typography variant="body2">
                {t('last contact', 'letzter Kontakt')} {when(edge.lastContactAt)} ·{' '}
                {t('last stored batch', 'zuletzt gespeichert')} {when(edge.lastBatchAt)} ·{' '}
                {t('waiting on the edge', 'wartend auf dem Edge')} {edge.backlog ?? '–'} ·{' '}
                {t('running', 'läuft')} {edge.softwareVersion ?? '–'}
                {edge.targetVersion
                  ? ` · ${t('upgrade staged to', 'Upgrade vorgesehen auf')} ${edge.targetVersion}`
                  : ''}
              </Typography>
              <Typography variant="body2">
                {t('Configuration', 'Konfiguration')}: {t('latest', 'neueste')}{' '}
                {edge.latestConfig?.revision ?? '–'}, {t('applied', 'angewendet')}{' '}
                {edge.appliedConfigRevision ?? '–'}
              </Typography>
              {edge.configRejection && <Alert severity="error">{edge.configRejection}</Alert>}
              {!edge.revokedAt && (
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    size="small"
                    label={`${t('Settings JSON for', 'Einstellungen (JSON) für')} ${edge.name}`}
                    value={revision[edge.id] ?? '{"syncIntervalSeconds": 30}'}
                    onChange={(e) => setRevision({ ...revision, [edge.id]: e.target.value })}
                  />
                  <Button
                    onClick={() =>
                      void run(
                        async () => {
                          await api.post(`${API_BASE_URL}/edges/${edge.id}/config`, {
                            settings: JSON.parse(
                              revision[edge.id] ?? '{"syncIntervalSeconds": 30}',
                            ),
                          });
                        },
                        t('Configuration revision saved.', 'Konfigurationsrevision gespeichert.'),
                      )
                    }
                  >
                    {t('Publish configuration', 'Konfiguration veröffentlichen')}
                  </Button>
                  <TextField
                    size="small"
                    label={`${t('Target version for', 'Zielversion für')} ${edge.name}`}
                    value={target[edge.id] ?? edge.targetVersion ?? ''}
                    onChange={(e) => setTarget({ ...target, [edge.id]: e.target.value })}
                  />
                  <Button
                    onClick={() =>
                      void run(
                        () =>
                          api.put(`${API_BASE_URL}/edges/${edge.id}/target-version`, {
                            targetVersion: (target[edge.id] ?? '').trim() || null,
                          }),
                        t('Staged version saved.', 'Vorgesehene Version gespeichert.'),
                      )
                    }
                  >
                    {t('Stage upgrade', 'Upgrade vormerken')}
                  </Button>
                  <Button
                    onClick={() =>
                      void run(
                        async () =>
                          issued(await api.post(`${API_BASE_URL}/edges/${edge.id}/enrollment`)),
                        t('New enrollment code issued.', 'Neuer Registrierungscode ausgestellt.'),
                      )
                    }
                  >
                    {t('New enrollment code', 'Neuer Registrierungscode')}
                  </Button>
                  <Button
                    color="error"
                    onClick={() =>
                      void run(
                        () => api.post(`${API_BASE_URL}/edges/${edge.id}/revoke`),
                        t('Edge revoked.', 'Edge widerrufen.'),
                      )
                    }
                  >
                    {t('Revoke', 'Widerrufen')} {edge.name}
                  </Button>
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
