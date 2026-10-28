import React, { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BundlePreview, ConfigurationBundle } from '@performance-dashboard/shared';
import { operationRequest } from '@/features/operations/api';
import { useT } from '@/i18n';

/** Reviewed configuration transfer for paused target machines. */
export default function ConfigurationBundlePanel() {
  const t = useT(),
    cache = useQueryClient();
  const [machine, setMachine] = useState(''),
    [dashboardIds, setDashboardIds] = useState<string[]>([]);
  const [bundle, setBundle] = useState<ConfigurationBundle | null>(null),
    [preview, setPreview] = useState<BundlePreview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const assets = useQuery({
    queryKey: ['bundle-assets'],
    queryFn: () => operationRequest<{ id: number; name: string }[]>('/production/assets'),
  });
  const boards = useQuery({
    queryKey: ['bundle-dashboards'],
    queryFn: () => operationRequest<{ id: string; name: string }[]>('/dashboards'),
  });
  const receipts = useQuery({
    queryKey: ['bundle-receipts', machine],
    enabled: !!machine,
    queryFn: () =>
      operationRequest<{ id: string; createdAt: string; rolledBackAt: string | null }[]>(
        `/configuration/machines/${machine}`,
      ),
  });
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const download = (data: unknown) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'machine-setup.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Stack spacing={2}>
      <Typography variant="h6">
        {t('Machine setup bundles', 'Maschinenkonfiguration übertragen')}
      </Typography>
      <Alert severity="info">
        {t(
          'Export saved dashboards, signal mappings and machine alarm rules. Imports add new items only. Pause the target machine first; imported mappings and rules stay disabled until reviewed in Machines and Alarms. Credentials and commissioning acceptance are not transferred.',
          'Gespeicherte Dashboards, Signalzuordnungen und Maschinenalarmregeln exportieren. Importe ergänzen nur neue Einträge. Zielmaschine zuerst pausieren; importierte Zuordnungen und Regeln bleiben bis zur Prüfung deaktiviert. Zugangsdaten und Inbetriebnahmefreigaben werden nicht übertragen.',
        )}
      </Alert>
      {(error || assets.error || boards.error || receipts.error) && (
        <Alert severity="error">
          {error || String(assets.error || boards.error || receipts.error)}
        </Alert>
      )}
      {message && <Alert severity="success">{message}</Alert>}
      <TextField
        select
        label={t('Source or target machine', 'Quell- oder Zielmaschine')}
        value={machine}
        disabled={busy}
        onChange={(e) => {
          setMachine(e.target.value);
          setPreview(null);
          setMessage('');
        }}
      >
        {assets.data?.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.name}
          </MenuItem>
        ))}
      </TextField>
      <Typography>
        {t('Saved dashboards to export', 'Gespeicherte Dashboards für den Export')}
      </Typography>
      {boards.data?.map((d) => (
        <FormControlLabel
          key={d.id}
          label={d.name}
          control={
            <Checkbox
              disabled={busy}
              checked={dashboardIds.includes(d.id)}
              onChange={(_, checked) =>
                setDashboardIds((ids) =>
                  checked ? [...ids, d.id] : ids.filter((id) => id !== d.id),
                )
              }
            />
          }
        />
      ))}
      <Button
        disabled={!machine || busy}
        onClick={() =>
          void run(async () =>
            download(
              await operationRequest(`/configuration/machines/${machine}/export`, 'POST', {
                dashboardIds,
              }),
            ),
          )
        }
      >
        {t('Export setup', 'Konfiguration exportieren')}
      </Button>
      <Button component="label" disabled={busy}>
        {t('Choose setup file', 'Konfigurationsdatei auswählen')}
        <input
          aria-label={t('Setup file', 'Konfigurationsdatei')}
          hidden
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setPreview(null);
            setBundle(null);
            void run(async () => {
              if (file.size > 1024 * 1024)
                throw new Error(t('Maximum file size is 1 MiB', 'Maximale Dateigröße: 1 MiB'));
              setBundle(JSON.parse(await file.text()));
            });
          }}
        />
      </Button>
      {bundle && (
        <Typography>
          {t(
            'File loaded. Preview against the selected target.',
            'Datei geladen. Vorschau für die gewählte Zielmaschine erstellen.',
          )}
        </Typography>
      )}
      <Button
        disabled={!machine || !bundle || busy}
        onClick={() =>
          void run(async () =>
            setPreview(
              await operationRequest<BundlePreview>(
                `/configuration/machines/${machine}/preview`,
                'POST',
                { bundle },
              ),
            ),
          )
        }
      >
        {t('Preview setup import', 'Konfigurationsimport prüfen')}
      </Button>
      {preview && (
        <>
          <Typography>
            {t('New mappings / rules / dashboards', 'Neue Zuordnungen / Regeln / Dashboards')}:{' '}
            {preview.counts.mappings} / {preview.counts.rules} / {preview.counts.dashboards}
          </Typography>
          {preview.conflicts.map((c) => (
            <Alert severity="warning" key={c}>
              {c}
            </Alert>
          ))}
          <Button
            variant="contained"
            disabled={busy || preview.conflicts.length > 0}
            onClick={() =>
              void run(async () => {
                await operationRequest(`/configuration/machines/${machine}/apply`, 'POST', {
                  bundle,
                  fingerprint: preview.fingerprint,
                });
                setPreview(null);
                setMessage(
                  t(
                    'Imported with mappings and rules disabled. Review before activation.',
                    'Importiert; Zuordnungen und Regeln sind deaktiviert. Vor Aktivierung prüfen.',
                  ),
                );
                await cache.invalidateQueries({ queryKey: ['bundle-receipts', machine] });
                await cache.invalidateQueries({ queryKey: ['bundle-dashboards'] });
              })
            }
          >
            {t('Import paused setup', 'Pausierte Konfiguration importieren')}
          </Button>
        </>
      )}
      {!!receipts.data?.length && (
        <Typography variant="h6">{t('Recent imports', 'Letzte Importe')}</Typography>
      )}
      {receipts.data?.map((r) => (
        <Stack key={r.id} spacing={1}>
          <Typography sx={{ overflowWrap: 'anywhere' }}>
            {new Date(r.createdAt).toLocaleString()} · {r.id}
          </Typography>
          {r.rolledBackAt ? (
            <Typography>{t('Rolled back', 'Zurückgenommen')}</Typography>
          ) : (
            <Button
              color="warning"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await operationRequest(
                    `/configuration/machines/${machine}/rollback/${r.id}`,
                    'POST',
                    {},
                  );
                  setMessage(
                    t(
                      'Unchanged imported items removed. Existing setup retained.',
                      'Unveränderte importierte Einträge entfernt. Bestehende Konfiguration bleibt erhalten.',
                    ),
                  );
                  setPreview(null);
                  await cache.invalidateQueries({ queryKey: ['bundle-receipts', machine] });
                  await cache.invalidateQueries({ queryKey: ['bundle-dashboards'] });
                })
              }
            >
              {t('Roll back this import', 'Diesen Import zurücknehmen')}
            </Button>
          )}
        </Stack>
      ))}
    </Stack>
  );
}
