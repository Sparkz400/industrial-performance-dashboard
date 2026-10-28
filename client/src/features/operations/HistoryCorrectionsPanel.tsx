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
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { operationRequest, localInput, toIso } from './api';

interface Measurement {
  id: number;
  timestamp: string;
  value: number | null;
  raw_value: unknown;
  status_code: string | null;
  reported_status_code: string | null;
  correction_revision: number;
  received_at: string | null;
  source_clock_state: string;
}
interface Correction {
  id: string;
  measurement_id: number;
  measured_at: string;
  revision: number;
  reason: string;
  created_by: number;
  before: { value: number | null };
  after: { value: number | null };
}
interface Input {
  requestId: string;
  measurementId: number;
  timestamp: string;
  expectedRevision: number;
  value: number | null;
  quality: 'good' | 'bad';
  reason: string;
}
interface Preview {
  after: { value: number | null };
  token: string;
  expires: number;
  affectedShifts: { id: number; name: string }[];
  shiftsTruncated: boolean;
}

/**
 * Review numeric projections without overwriting original source values.
 * @param root0 Selected scope.
 * @param root0.machineId Machine under review.
 */
export default function HistoryCorrectionsPanel({ machineId }: { machineId: number }) {
  const t = useT();
  const canCorrect = useAuthStore(
    (s) => ['admin', 'supervisor'].includes(s.user?.role ?? '') && !s.user?.recoveryMode,
  );
  const [key, setKey] = useState('Count');
  const [start, setStart] = useState(localInput(new Date(Date.now() - 86400000).toISOString()));
  const [end, setEnd] = useState(localInput(new Date().toISOString()));
  const [result, setResult] = useState<{ rows: Measurement[]; truncated: boolean } | null>(null);
  const [selected, setSelected] = useState<Measurement | null>(null);
  const [value, setValue] = useState('');
  const [quality, setQuality] = useState<'good' | 'bad'>('good');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<(Preview & { input: Input }) | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const ledger = useQuery({
    queryKey: ['measurement-corrections', machineId],
    queryFn: () =>
      operationRequest<{ rows: Correction[]; truncated: boolean }>(
        `/history/${machineId}/corrections`,
      ),
    enabled: machineId > 0,
  });
  const invalidate = () => {
    setPreview(null);
    setConfirmed(false);
    setMessage('');
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    const rows = await operationRequest<{ rows: Measurement[]; truncated: boolean }>(
      `/history/${machineId}/measurements?${new URLSearchParams({ nodeKey: key, start: toIso(start), end: toIso(end) })}`,
    );
    setResult(rows);
    setSelected(null);
    invalidate();
  };
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">{t('Measurement corrections', 'Messwertkorrekturen')}</Typography>
        <Alert severity="info">
          {t(
            'Review a numeric value or mark it bad. Original raw values, timestamps and identity stay unchanged. Saved reports and recorded alarms are not rewritten. Corrected source evidence is retained.',
            'Zahlenwerte prüfen oder als ungültig markieren. Rohwerte, Zeitstempel und Identität bleiben erhalten. Gespeicherte Berichte und Alarme werden nicht umgeschrieben. Korrigierte Quelldaten bleiben erhalten.',
          )}
        </Alert>
        <TextField
          label={t('Correction signal key', 'Signalschlüssel für Korrektur')}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setResult(null);
            setSelected(null);
            invalidate();
          }}
        />
        <TextField
          type="datetime-local"
          label={t('Correction window start', 'Beginn des Korrekturfensters')}
          slotProps={{ inputLabel: { shrink: true } }}
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            setResult(null);
            setSelected(null);
            invalidate();
          }}
        />
        <TextField
          type="datetime-local"
          label={t('Correction window end', 'Ende des Korrekturfensters')}
          slotProps={{ inputLabel: { shrink: true } }}
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
            setResult(null);
            setSelected(null);
            invalidate();
          }}
        />
        <Button disabled={busy || !key.trim() || !start || !end} onClick={() => void run(load)}>
          {t('Find measurements', 'Messwerte suchen')}
        </Button>
        {result?.truncated && (
          <Alert severity="warning">
            {t(
              'Showing the latest 200 rows. Narrow the window before review.',
              'Die neuesten 200 Zeilen werden angezeigt. Das Zeitfenster zur Prüfung eingrenzen.',
            )}
          </Alert>
        )}
        {result && !result.rows.length && (
          <Alert severity="info">
            {t(
              'No retained raw measurements in this window.',
              'Keine aufbewahrten Rohmesswerte in diesem Zeitfenster.',
            )}
          </Alert>
        )}
        {!!result?.rows.length && (
          <TextField
            select
            label={t('Measurement to review', 'Zu prüfender Messwert')}
            value={selected ? `${selected.timestamp}/${selected.id}` : ''}
            onChange={(e) => {
              const row =
                result.rows.find((item) => `${item.timestamp}/${item.id}` === e.target.value) ??
                null;
              setSelected(row);
              setValue(row?.value == null ? '' : String(row.value));
              setQuality(row?.value == null ? 'bad' : 'good');
              setReason('');
              invalidate();
            }}
          >
            {result.rows.map((row) => (
              <MenuItem key={`${row.timestamp}/${row.id}`} value={`${row.timestamp}/${row.id}`}>
                {new Date(row.timestamp).toLocaleString()} ·{' '}
                {row.value ?? t('Unknown', 'Unbekannt')} · r{row.correction_revision}
              </MenuItem>
            ))}
          </TextField>
        )}
        {selected && (
          <>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              {t('Raw source value', 'Rohwert der Quelle')}: {JSON.stringify(selected.raw_value)} ·{' '}
              {t('Reported quality', 'Gemeldete Qualität')}:{' '}
              {selected.reported_status_code ??
                (selected.correction_revision
                  ? t('See revision history', 'Siehe Versionsverlauf')
                  : selected.status_code)}{' '}
              · {t('Current quality', 'Aktuelle Qualität')}: {selected.status_code}
            </Typography>
            {canCorrect && (
              <>
                <TextField
                  select
                  label={t('Corrected quality', 'Korrigierte Qualität')}
                  value={quality}
                  onChange={(e) => {
                    setQuality(e.target.value as 'good' | 'bad');
                    invalidate();
                  }}
                >
                  <MenuItem value="good">
                    {t('Manually reviewed value', 'Manuell geprüfter Wert')}
                  </MenuItem>
                  <MenuItem value="bad">{t('Bad / unknown', 'Ungültig / unbekannt')}</MenuItem>
                </TextField>
                {quality === 'good' && (
                  <TextField
                    label={t('Corrected numeric value', 'Korrigierter Zahlenwert')}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      invalidate();
                    }}
                  />
                )}
                <TextField
                  multiline
                  label={t('Correction reason', 'Korrekturgrund')}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    invalidate();
                  }}
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                />
                <Button
                  disabled={
                    busy ||
                    !reason.trim() ||
                    (quality === 'good' && (!value.trim() || !Number.isFinite(Number(value))))
                  }
                  onClick={() =>
                    void run(async () => {
                      const input: Input = {
                        requestId: crypto.randomUUID(),
                        measurementId: selected.id,
                        timestamp: selected.timestamp,
                        expectedRevision: selected.correction_revision,
                        value: quality === 'bad' ? null : Number(value),
                        quality,
                        reason: reason.trim(),
                      };
                      const reviewed = await operationRequest<Preview>(
                        `/history/${machineId}/corrections/preview`,
                        'POST',
                        input,
                      );
                      setPreview({ ...reviewed, input });
                      setConfirmed(false);
                    })
                  }
                >
                  {t('Preview correction', 'Korrektur prüfen')}
                </Button>
              </>
            )}
          </>
        )}
        {preview && (
          <>
            <Alert severity="warning">
              {t('Stored numeric value', 'Gespeicherter Zahlenwert')}:{' '}
              {preview.after.value ?? t('Unknown', 'Unbekannt')}.{' '}
              {t('Potentially affected shifts', 'Möglicherweise betroffene Schichten')}:{' '}
              {preview.affectedShifts.map((s) => s.name).join(', ') ||
                t('None found', 'Keine gefunden')}
              {preview.shiftsTruncated ? '…' : ''}.{' '}
              {t(
                'A new report revision requires separate review.',
                'Eine neue Berichtsversion erfordert eine separate Prüfung.',
              )}
            </Alert>
            <FormControlLabel
              control={
                <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              }
              label={t(
                'I reviewed the value, quality and affected calculations',
                'Wert, Qualität und betroffene Berechnungen wurden geprüft',
              )}
            />
            <Button
              disabled={busy || !confirmed}
              onClick={() =>
                void run(async () => {
                  await operationRequest(`/history/${machineId}/corrections`, 'POST', {
                    ...preview.input,
                    token: preview.token,
                    expires: preview.expires,
                  });
                  await load();
                  await ledger.refetch();
                  setMessage(
                    t(
                      'Correction recorded. Saved report revisions remain unchanged.',
                      'Korrektur gespeichert. Gespeicherte Berichtsversionen bleiben unverändert.',
                    ),
                  );
                })
              }
            >
              {t('Apply reviewed correction', 'Geprüfte Korrektur anwenden')}
            </Button>
          </>
        )}
        {(error || ledger.error) && <Alert severity="error">{error || String(ledger.error)}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        {!!ledger.data?.rows.length && (
          <>
            <Typography variant="subtitle1">
              {t('Recent correction history', 'Letzte Korrekturen')}
            </Typography>
            {ledger.data.rows.slice(0, 20).map((row) => (
              <Typography key={row.id} sx={{ overflowWrap: 'anywhere' }}>
                {new Date(row.measured_at).toLocaleString()} · r{row.revision} ·{' '}
                {row.before.value ?? '—'} → {row.after.value ?? '—'} · {row.reason} ·{' '}
                {t('Reviewer', 'Prüfer')} #{row.created_by}
              </Typography>
            ))}
            {ledger.data.rows.length > 20 && (
              <Typography>
                {t(
                  'Showing the latest 20 corrections.',
                  'Die letzten 20 Korrekturen werden angezeigt.',
                )}
              </Typography>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
