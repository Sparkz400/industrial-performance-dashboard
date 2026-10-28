import { useLanguage } from '@/i18n';
import HistoryCorrectionsPanel from './HistoryCorrectionsPanel';
import React, { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/useAuthStore';
import { API_BASE_URL } from '@/config/config';
import { useT } from '@/i18n';
import { operationRequest, localInput, toIso } from './api';
interface Preview {
  id: string;
  rows: number;
  protectedRows?: number;
  deleted: number;
  completed: boolean;
  cutoff: string;
}
interface Storage {
  disks?: { kind: string; freeBytes?: number; daysToReserve: number | null; error?: string }[];
  schedules?: { id: number; run_at: string; status: string; error: string | null }[];
  rows: number;
  database_bytes: number;
  history_bytes: number;
  estimatedAdditional30DayBytes: number | null;
  policy: { days: number } | null;
  previews: Preview[];
}
/**
 *
 * @param root0
 * @param root0.machineId
 */
export default function HistoryPanel({ machineId }: { machineId: number }) {
  const [scheduledFor, setScheduledFor] = useState(''),
    [scheduledMessage, setScheduledMessage] = useState('');
  const t = useT(),
    admin = useAuthStore((s) => s.user?.role === 'admin' && !s.user.recoveryMode);
  const [keys, setKeys] = useState('Count'),
    [from, setFrom] = useState(localInput(new Date(Date.now() - 86400000).toISOString())),
    [to, setTo] = useState(localInput(new Date().toISOString()));
  const [days, setDays] = useState('90'),
    [preview, setPreview] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const storage = useQuery({
    queryKey: ['history-storage', machineId],
    queryFn: () => operationRequest<Storage>(`/history/${machineId}/storage`),
    enabled: admin,
  });
  const [summaries, setSummaries] = useState<
    { bucket: string; samples: number; good: number; average: number | null }[] | null
  >(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const valid = !!keys.trim() && !!from && !!to && Date.parse(to) > Date.parse(from);
  const exportUrl = valid
    ? `${API_BASE_URL}/trending/export-csv?${new URLSearchParams({ machineId: String(machineId), nodeKeys: keys, startDate: toIso(from), endDate: toIso(to) })}`
    : '';
  return (
    <Stack spacing={3}>
      <Typography variant="h5">{t('History')}</Typography>
      <HistoryCorrectionsPanel key={machineId} machineId={machineId} />
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('Export measurements', 'Messwerte exportieren')}</Typography>
          <Alert severity="info">
            {t(
              'Exports stream every raw measurement, including quality and source metadata. Times use your browser timezone.',
              'Exporte enthalten alle Rohmesswerte mit Qualität und Herkunft. Zeiten verwenden die Zeitzone des Browsers.',
            )}
          </Alert>
          <TextField
            label={t('Signal keys, separated by commas', 'Signalschlüssel, durch Komma getrennt')}
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
          />
          <TextField
            type="datetime-local"
            label={t('From', 'Von')}
            slotProps={{ inputLabel: { shrink: true } }}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            type="datetime-local"
            label={t('To', 'Bis')}
            slotProps={{ inputLabel: { shrink: true } }}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button
            component="a"
            href={exportUrl || undefined}
            disabled={!valid}
            target="_blank"
            rel="noopener"
          >
            {t('Download complete CSV', 'Vollständige CSV herunterladen')}
          </Button>
          <Button
            disabled={busy || !valid || keys.includes(',')}
            onClick={() =>
              void run(async () =>
                setSummaries(
                  await operationRequest(
                    `/history/${machineId}/summaries?${new URLSearchParams({ nodeKey: keys, start: toIso(from), end: toIso(to) })}`,
                  ),
                ),
              )
            }
          >
            {t('Show retained hourly summaries', 'Aufbewahrte Stundenwerte anzeigen')}
          </Button>
          {summaries && (
            <>
              <Typography>
                {t(
                  'These summaries contain removed raw rows only. Mixed-quality averages remain unknown.',
                  'Diese Zusammenfassungen enthalten nur entfernte Rohdaten. Bei gemischter Qualität bleibt der Mittelwert unbekannt.',
                )}
              </Typography>
              {summaries.length === 0 && (
                <Typography>
                  {t(
                    'No retained summaries in this window.',
                    'Keine aufbewahrten Zusammenfassungen in diesem Zeitraum.',
                  )}
                </Typography>
              )}
              {summaries.map((s) => (
                <Typography key={s.bucket}>
                  {new Date(s.bucket).toLocaleString(useLanguage.getState().language)} · {s.good}/
                  {s.samples} {t('good samples', 'gute Messwerte')} · {s.average ?? t('Unknown')}
                </Typography>
              ))}
            </>
          )}
        </Stack>
      </Paper>
      {admin && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h6">
              {t('Storage and retention', 'Speicher und Aufbewahrung')}
            </Typography>
            {storage.error && <Alert severity="error">{String(storage.error)}</Alert>}
            {storage.data?.disks?.map((d) => (
              <Alert
                key={d.kind}
                severity={d.daysToReserve != null && d.daysToReserve < 2 ? 'warning' : 'info'}
              >
                {d.kind}: free{' '}
                {d.freeBytes == null ? 'Unknown' : `${(d.freeBytes / 1073741824).toFixed(2)} GiB`} ·
                runway{' '}
                {d.daysToReserve == null
                  ? 'Unknown'
                  : `${d.daysToReserve.toFixed(1)} days to reserve`}
                . {d.error}
              </Alert>
            ))}
            {scheduledMessage && <Alert severity="success">{scheduledMessage}</Alert>}
            {storage.data?.schedules?.map((s) => (
              <Typography key={s.id}>
                Scheduled retention: {new Date(s.run_at).toLocaleString()} · {s.status} {s.error}
              </Typography>
            ))}
            {storage.data && (
              <>
                <Typography>
                  {t('Raw rows', 'Rohdatenzeilen')}:{' '}
                  {storage.data.rows.toLocaleString(useLanguage.getState().language)} ·{' '}
                  {t('Database', 'Datenbank')}: {(storage.data.database_bytes / 1048576).toFixed(1)}{' '}
                  MiB
                </Typography>
                <Typography>
                  {t(
                    'Estimated additional row storage over 30 days',
                    'Geschätzter zusätzlicher Zeilenspeicher in 30 Tagen',
                  )}
                  :{' '}
                  {storage.data.estimatedAdditional30DayBytes == null
                    ? t('Unknown')
                    : `${(storage.data.estimatedAdditional30DayBytes / 1048576).toFixed(1)} MiB`}
                </Typography>
                <Typography variant="body2">
                  {t(
                    'Forecast uses the last 24 hours of receipts. Indexes, compression and free disk are excluded.',
                    'Die Prognose nutzt die Eingänge der letzten 24 Stunden. Indizes, Kompression und freier Speicher sind nicht enthalten.',
                  )}
                </Typography>
                <Typography>
                  {t('Saved retention days', 'Gespeicherte Aufbewahrungstage')}:{' '}
                  {storage.data.policy?.days ?? t('Not configured', 'Nicht konfiguriert')}
                </Typography>
              </>
            )}
            <TextField
              type="number"
              label={t('Keep raw data for days', 'Rohdaten für folgende Tage behalten')}
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setPreview(null);
                setConfirmed(false);
              }}
            />
            <Button
              disabled={busy || !days}
              onClick={() =>
                void run(async () => {
                  await operationRequest(`/history/${machineId}/policy`, 'PUT', {
                    days: Number(days),
                  });
                  setPreview(null);
                  setConfirmed(false);
                  await storage.refetch();
                })
              }
            >
              {t('Save retention policy', 'Aufbewahrungsregel speichern')}
            </Button>
            <Button
              disabled={busy || !storage.data?.policy}
              onClick={() =>
                void run(async () => {
                  setPreview(await operationRequest(`/history/${machineId}/preview`, 'POST', {}));
                  setConfirmed(false);
                })
              }
            >
              {t('Preview removal', 'Entfernung prüfen')}
            </Button>
            {preview && (
              <>
                <Alert severity="warning">
                  {preview.rows.toLocaleString(useLanguage.getState().language)}{' '}
                  {t(
                    'raw rows eligible; protected evidence rows',
                    'entfernbare Rohdatenzeilen; geschützte Nachweiszeilen',
                  )}
                  : {preview.protectedRows ?? '—'}.{' '}
                  {t(
                    'Hourly quality summaries are retained. Raw values cannot be recovered without a backup.',
                    'Stundenwerte mit Qualität bleiben erhalten. Rohwerte können nur aus einer Sicherung wiederhergestellt werden.',
                  )}
                </Alert>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                  }
                  label={t(
                    'I reviewed this exact preview and have the backup I need.',
                    'Ich habe diese Vorschau geprüft und die benötigte Sicherung erstellt.',
                  )}
                />
                <Button
                  color="warning"
                  disabled={busy || !confirmed || preview.completed}
                  onClick={() =>
                    void run(async () => {
                      let next = preview;
                      do {
                        next = await operationRequest(`/history/${machineId}/apply`, 'POST', {
                          previewId: preview.id,
                          confirmRows: preview.rows,
                        });
                        setPreview((p) => ({ ...next, protectedRows: p?.protectedRows }));
                      } while (!next.completed);
                      await storage.refetch();
                    })
                  }
                >
                  {t('Apply reviewed retention', 'Geprüfte Aufbewahrung anwenden')}
                </Button>
                <TextField
                  label="Run reviewed retention at (within one hour of preview)"
                  type="datetime-local"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
                <Button
                  disabled={busy || !confirmed || preview.completed || !scheduledFor}
                  onClick={() =>
                    void run(async () => {
                      await operationRequest(`/history/${machineId}/schedule`, 'POST', {
                        previewId: preview.id,
                        confirmRows: preview.rows,
                        runAt: toIso(scheduledFor),
                      });
                      setScheduledMessage(
                        'Reviewed retention scheduled. It will fail safely if the preview or policy expires.',
                      );
                    })
                  }
                >
                  Schedule reviewed retention
                </Button>
                <Typography role="status">
                  {t('Removed', 'Entfernt')}:{' '}
                  {preview.deleted.toLocaleString(useLanguage.getState().language)}{' '}
                  {preview.completed ? t('Complete', 'Abgeschlossen') : ''}
                </Typography>
              </>
            )}
            {storage.data?.previews
              .filter((p) => p.completed)
              .slice(0, 5)
              .map((p) => (
                <Typography key={p.id}>
                  {t('Completed removal', 'Abgeschlossene Entfernung')}:{' '}
                  {p.deleted.toLocaleString(useLanguage.getState().language)} ·{' '}
                  {new Date(p.cutoff).toLocaleString(useLanguage.getState().language)}
                </Typography>
              ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
