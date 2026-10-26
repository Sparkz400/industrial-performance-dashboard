import { useLanguage } from '@/i18n';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductRun } from '@performance-dashboard/shared';
import { useAuthStore } from '@/stores/useAuthStore';
import { useT } from '@/i18n';
import { operationRequest, localInput, toIso } from './api';
import { downloadJson } from '../production/CommissioningPanel';
interface CalendarConfig {
  name: string;
  timezone: string;
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  holidays: string[];
  fold: 'reject' | 'earlier' | 'later';
  breaks: { offsetMinutes: number; durationMinutes: number }[];
  job: { reference: string; product: string; target: number | null };
}
interface Calendar {
  id: number;
  version: number;
  config: CalendarConfig;
}
interface PlanPreview {
  digest: string;
  items: { date: string; start: string; end: string; status: string }[];
  applied: boolean;
}
interface Shift {
  id: number;
  name: string;
  machineId: number;
  start: string;
  end: string;
}
const initial: CalendarConfig = {
  name: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  weekdays: [1, 2, 3, 4, 5],
  startTime: '06:00',
  durationMinutes: 480,
  holidays: [],
  fold: 'reject',
  breaks: [],
  job: { reference: '', product: '', target: null },
};
/**
 *
 * @param root0
 * @param root0.machineId
 */
export default function PlanningPanel({ machineId }: { machineId: number }) {
  const queryClient = useQueryClient();
  const t = useT(),
    user = useAuthStore((s) => s.user),
    role = user?.role,
    edit = !user?.recoveryMode && (role === 'admin' || role === 'supervisor');
  const [selected, setSelected] = useState(''),
    [config, setConfig] = useState<CalendarConfig>(initial),
    [from, setFrom] = useState(new Date().toISOString().slice(0, 10)),
    [to, setTo] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PlanPreview | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const calendars = useQuery({
    queryKey: ['calendars', machineId],
    queryFn: () => operationRequest<Calendar[]>(`/planning/machines/${machineId}/calendars`),
  });
  const selectedCalendar = calendars.data?.find((c) => c.id === Number(selected));
  const change = (patch: Partial<CalendarConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setPreview(null);
  };
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
  const planBody = { calendarId: Number(selected), from, to };
  return (
    <Stack spacing={3}>
      <Typography variant="h5">{t('Planning')}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert role="status" severity="success">
          {message}
        </Alert>
      )}
      {calendars.error && <Alert severity="error">{String(calendars.error)}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">
            {t('Recurring shift calendars', 'Wiederkehrende Schichtkalender')}
          </Typography>
          <TextField
            select
            label={t('Calendar', 'Kalender')}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setConfig(
                calendars.data?.find((c) => c.id === Number(e.target.value))?.config ?? initial,
              );
              setPreview(null);
            }}
          >
            <MenuItem value="">{t('New calendar', 'Neuer Kalender')}</MenuItem>
            {calendars.data?.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.config.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            disabled={!edit}
            label={t('Calendar name', 'Kalendername')}
            value={config.name}
            onChange={(e) => change({ name: e.target.value })}
          />
          <TextField
            disabled={!edit}
            label={t('Timezone', 'Zeitzone')}
            helperText="Europe/Berlin · America/New_York · UTC"
            value={config.timezone}
            onChange={(e) => change({ timezone: e.target.value })}
          />
          <Stack direction="row" flexWrap="wrap">
            {[
              ['Sunday', 'Sonntag'],
              ['Monday', 'Montag'],
              ['Tuesday', 'Dienstag'],
              ['Wednesday', 'Mittwoch'],
              ['Thursday', 'Donnerstag'],
              ['Friday', 'Freitag'],
              ['Saturday', 'Samstag'],
            ].map(([day, german], i) => (
              <FormControlLabel
                key={day}
                label={t(day, german)}
                control={
                  <Checkbox
                    disabled={!edit}
                    checked={config.weekdays.includes(i)}
                    onChange={() =>
                      change({
                        weekdays: config.weekdays.includes(i)
                          ? config.weekdays.filter((n) => n !== i)
                          : [...config.weekdays, i],
                      })
                    }
                  />
                }
              />
            ))}
          </Stack>
          <TextField
            disabled={!edit}
            type="time"
            label={t('Local start time', 'Lokale Startzeit')}
            slotProps={{ inputLabel: { shrink: true } }}
            value={config.startTime}
            onChange={(e) => change({ startTime: e.target.value })}
          />
          <TextField
            disabled={!edit}
            type="number"
            label={t('Elapsed duration in minutes', 'Verstrichene Dauer in Minuten')}
            helperText={t(
              'Duration stays fixed across daylight-saving changes.',
              'Die Dauer bleibt auch bei Zeitumstellung gleich.',
            )}
            value={config.durationMinutes}
            onChange={(e) => change({ durationMinutes: Number(e.target.value) })}
          />
          <TextField
            disabled={!edit}
            select
            label={t('Repeated local time', 'Doppelte lokale Uhrzeit')}
            value={config.fold}
            onChange={(e) => change({ fold: e.target.value as CalendarConfig['fold'] })}
          >
            {[
              ['reject', 'Require review', 'Prüfung erforderlich'],
              ['earlier', 'Earlier occurrence', 'Früheres Vorkommen'],
              ['later', 'Later occurrence', 'Späteres Vorkommen'],
            ].map(([value, en, de]) => (
              <MenuItem key={value} value={value}>
                {t(en, de)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            disabled={!edit}
            label={t(
              'Holidays (YYYY-MM-DD, comma separated)',
              'Feiertage (JJJJ-MM-TT, durch Komma getrennt)',
            )}
            value={config.holidays.join(', ')}
            onChange={(e) =>
              change({
                holidays: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
          <TextField
            disabled={!edit}
            label={t('Default job reference', 'Standard-Auftragsnummer')}
            value={config.job.reference}
            onChange={(e) => change({ job: { ...config.job, reference: e.target.value } })}
          />
          <TextField
            disabled={!edit}
            label={t('Default product', 'Standardprodukt')}
            value={config.job.product}
            onChange={(e) => change({ job: { ...config.job, product: e.target.value } })}
          />
          <TextField
            disabled={!edit}
            type="number"
            label={t('Target quantity (optional)', 'Zielmenge (optional)')}
            value={config.job.target ?? ''}
            onChange={(e) =>
              change({
                job: {
                  ...config.job,
                  target: e.target.value === '' ? null : Number(e.target.value),
                },
              })
            }
          />
          {config.breaks.map((b, i) => (
            <Stack key={i} direction={{ xs: 'column', sm: 'row' }} gap={1}>
              <TextField
                disabled={!edit}
                type="number"
                label={t('Break starts after minutes', 'Pause beginnt nach Minuten')}
                value={b.offsetMinutes}
                onChange={(e) =>
                  change({
                    breaks: config.breaks.map((row, n) =>
                      n === i ? { ...row, offsetMinutes: Number(e.target.value) } : row,
                    ),
                  })
                }
              />
              <TextField
                disabled={!edit}
                type="number"
                label={t('Break duration in minutes', 'Pausendauer in Minuten')}
                value={b.durationMinutes}
                onChange={(e) =>
                  change({
                    breaks: config.breaks.map((row, n) =>
                      n === i ? { ...row, durationMinutes: Number(e.target.value) } : row,
                    ),
                  })
                }
              />
              <Button
                disabled={!edit}
                onClick={() => change({ breaks: config.breaks.filter((_, n) => n !== i) })}
              >
                {t('Remove break', 'Pause entfernen')}
              </Button>
            </Stack>
          ))}
          {edit && (
            <>
              <Button
                onClick={() =>
                  change({
                    breaks: [...config.breaks, { offsetMinutes: 240, durationMinutes: 30 }],
                  })
                }
              >
                {t('Add break', 'Pause hinzufügen')}
              </Button>
              <Button
                disabled={busy || !config.name}
                onClick={() =>
                  void run(async () => {
                    const saved = await operationRequest<Calendar>(
                      `/planning/machines/${machineId}/calendars`,
                      'POST',
                      {
                        ...(selectedCalendar
                          ? { id: selectedCalendar.id, version: selectedCalendar.version }
                          : {}),
                        config,
                      },
                    );
                    await calendars.refetch();
                    setSelected(String(saved.id));
                    setConfig(saved.config);
                    setPreview(null);
                    setMessage(
                      t(
                        'Calendar saved. Preview dates before publishing.',
                        'Kalender gespeichert. Vor Veröffentlichung die Termine prüfen.',
                      ),
                    );
                  })
                }
              >
                {t('Save calendar', 'Kalender speichern')}
              </Button>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <TextField
                  type="date"
                  label={t('First date', 'Erstes Datum')}
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreview(null);
                  }}
                />
                <TextField
                  type="date"
                  label={t('Last date', 'Letztes Datum')}
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreview(null);
                  }}
                />
              </Stack>
              <Button
                disabled={
                  busy ||
                  !selected ||
                  JSON.stringify(config) !== JSON.stringify(selectedCalendar?.config)
                }
                onClick={() =>
                  void run(async () =>
                    setPreview(
                      await operationRequest(
                        `/planning/machines/${machineId}/plan`,
                        'POST',
                        planBody,
                      ),
                    ),
                  )
                }
              >
                {t('Preview shifts', 'Schichten voranzeigen')}
              </Button>
              {preview && (
                <>
                  <Typography>
                    {t(
                      'Existing shifts keep their original calendar settings. Conflicts block publication.',
                      'Bestehende Schichten behalten ihre ursprünglichen Kalendereinstellungen. Konflikte verhindern die Veröffentlichung.',
                    )}
                  </Typography>
                  {preview.items.map((item) => (
                    <Typography key={item.date}>
                      {item.date}:{' '}
                      {new Date(item.start).toLocaleString(useLanguage.getState().language)} –{' '}
                      {new Date(item.end).toLocaleString(useLanguage.getState().language)} ·{' '}
                      {t(
                        item.status,
                        { new: 'neu', conflict: 'Konflikt', 'already-planned': 'bereits geplant' }[
                          item.status
                        ],
                      )}
                    </Typography>
                  ))}
                  <Button
                    disabled={
                      busy || preview.applied || preview.items.some((i) => i.status === 'conflict')
                    }
                    onClick={() =>
                      void run(async () => {
                        setPreview(
                          await operationRequest(`/planning/machines/${machineId}/plan`, 'POST', {
                            ...planBody,
                            confirmDigest: preview.digest,
                          }),
                        );
                        await queryClient.invalidateQueries({ queryKey: ['production-shifts'] });
                        setMessage(t('Shifts published.', 'Schichten veröffentlicht.'));
                      })
                    }
                  >
                    {t('Publish reviewed shifts', 'Geprüfte Schichten veröffentlichen')}
                  </Button>
                </>
              )}
            </>
          )}
        </Stack>
      </Paper>
      <ProductRuns machineId={machineId} editable={edit} />
    </Stack>
  );
}
/**
 *
 * @param root0
 * @param root0.machineId
 * @param root0.editable
 */
function ProductRuns({ machineId, editable }: { machineId: number; editable: boolean }) {
  const t = useT(),
    [selected, setSelected] = useState(''),
    [runs, setRuns] = useState<ProductRun[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const shifts = useQuery({
    queryKey: ['production-shifts'],
    queryFn: () => operationRequest<Shift[]>('/production/shifts'),
  });
  const plan = useQuery({
    queryKey: ['product-runs', selected],
    queryFn: () =>
      operationRequest<{ runs: ProductRun[]; version: number; start: string; end: string }>(
        `/planning/shifts/${selected}/runs`,
      ),
    enabled: !!selected,
  });
  const revisions = useQuery({
    queryKey: ['shift-revisions', selected],
    queryFn: () =>
      operationRequest<{ id: number; digest: string; createdAt: string; createdBy: number }[]>(
        `/planning/shifts/${selected}/revisions`,
      ),
    enabled: !!selected,
  });
  const rows = runs ?? plan.data?.runs ?? [];
  const update = (index: number, patch: Partial<ProductRun>) =>
    setRuns(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
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
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">
          {t('Product runs and report revisions', 'Produktläufe und Berichtsversionen')}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {plan.error && <Alert severity="error">{String(plan.error)}</Alert>}
        <TextField
          select
          label={t('Shift')}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setRuns(null);
          }}
        >
          {shifts.data
            ?.filter((s) => s.machineId === machineId)
            .map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
        </TextField>
        {selected && plan.data && (
          <>
            <Alert severity="info">
              {t(
                'Run times use your browser timezone. Runs cannot overlap. Saved report revisions remain unchanged after corrections.',
                'Laufzeiten verwenden die Browser-Zeitzone. Läufe dürfen sich nicht überschneiden. Gespeicherte Berichtsversionen bleiben nach Korrekturen unverändert.',
              )}
            </Alert>
            {rows.map((r, i) => (
              <Paper variant="outlined" sx={{ p: 2 }} key={i}>
                <Stack spacing={2}>
                  <Typography>
                    {t('Product run', 'Produktlauf')} {i + 1}
                  </Typography>
                  <TextField
                    disabled={!editable}
                    label={t('Job reference', 'Auftragsnummer')}
                    value={r.reference}
                    onChange={(e) => update(i, { reference: e.target.value })}
                  />
                  <TextField
                    disabled={!editable}
                    label={t('Product', 'Produkt')}
                    value={r.product}
                    onChange={(e) => update(i, { product: e.target.value })}
                  />
                  <TextField
                    disabled={!editable}
                    type="datetime-local"
                    label={t('Run start', 'Laufbeginn')}
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={localInput(r.start)}
                    onChange={(e) => {
                      if (e.target.value) update(i, { start: toIso(e.target.value) });
                    }}
                  />
                  <TextField
                    disabled={!editable}
                    type="datetime-local"
                    label={t('Run end', 'Laufende')}
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={localInput(r.end)}
                    onChange={(e) => {
                      if (e.target.value) update(i, { end: toIso(e.target.value) });
                    }}
                  />
                  <TextField
                    disabled={!editable}
                    type="number"
                    label={t('Ideal cycle in milliseconds', 'Ideale Zykluszeit in Millisekunden')}
                    value={r.idealCycleMs}
                    onChange={(e) => update(i, { idealCycleMs: Number(e.target.value) })}
                  />
                  <TextField
                    disabled={!editable}
                    type="number"
                    label={t('Run target (optional)', 'Laufziel (optional)')}
                    value={r.target ?? ''}
                    onChange={(e) =>
                      update(i, { target: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                  {editable && (
                    <Button onClick={() => setRuns(rows.filter((_, n) => n !== i))}>
                      {t('Remove run', 'Lauf entfernen')}
                    </Button>
                  )}
                </Stack>
              </Paper>
            ))}
            {editable && (
              <>
                <Button
                  disabled={busy || rows.length >= 30}
                  onClick={() =>
                    setRuns([
                      ...rows,
                      {
                        start: plan.data!.start,
                        end: plan.data!.end,
                        reference: '',
                        product: '',
                        target: null,
                        idealCycleMs: 1000,
                      },
                    ])
                  }
                >
                  {t('Add product run', 'Produktlauf hinzufügen')}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await operationRequest(`/planning/shifts/${selected}/runs`, 'PUT', {
                        version: plan.data!.version,
                        runs: rows,
                      });
                      await plan.refetch();
                      setRuns(null);
                    })
                  }
                >
                  {t('Save product runs', 'Produktläufe speichern')}
                </Button>
                <Button
                  disabled={busy || runs !== null}
                  onClick={() =>
                    void run(async () => {
                      await operationRequest(`/planning/shifts/${selected}/revisions`, 'POST', {});
                      await revisions.refetch();
                    })
                  }
                >
                  {t('Save report revision', 'Berichtsversion speichern')}
                </Button>
              </>
            )}
            {revisions.data?.map((r) => (
              <Stack key={r.id} direction={{ xs: 'column', sm: 'row' }} gap={1}>
                <Typography>
                  {new Date(r.createdAt).toLocaleString(useLanguage.getState().language)} ·{' '}
                  {t('Author', 'Autor')}: {r.createdBy} · {r.digest.slice(0, 16)}
                </Typography>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      downloadJson(
                        await operationRequest(`/planning/shifts/${selected}/revisions/${r.id}`),
                        `shift-${selected}-revision-${r.id}.json`,
                      ),
                    )
                  }
                >
                  {t('Download revision', 'Version herunterladen')}
                </Button>
              </Stack>
            ))}
          </>
        )}
      </Stack>
    </Paper>
  );
}
