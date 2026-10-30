import { useLanguage } from '@/i18n';
import React, { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { API_BASE_URL } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';
import { operationRequest, toIso } from './api';
interface Config {
  name: string;
  days: number | null;
  runtimeHours: number | null;
  cycles: number | null;
  checks: string[];
  active: boolean;
}
interface Stop {
  id: number;
  shiftId: number;
  shiftName: string;
  start: string;
  end: string;
  category: string;
  reason: string;
}
interface Attachment {
  id: number;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
}
interface ServiceEvent {
  id: number;
  createdAt: string;
  createdBy: number;
  note: string;
  serviced: boolean;
  checks: Record<string, boolean>;
  incidentId: number | null;
  stop: Stop | null;
  trendStart: string | null;
  trendEnd: string | null;
  trendKeys: string[] | null;
  attachments: Attachment[];
}
const attachmentPath = (plan: number, event: number) =>
  `${API_BASE_URL}/maintenance/plans/${plan}/events/${event}/attachments`;
/**
 * Lists a service record's attachments and adds new ones.
 * @param root0
 * @param root0.plan
 * @param root0.event
 * @param root0.canAdd
 * @param root0.onSaved
 */
function Attachments({
  plan,
  event,
  canAdd,
  onSaved,
}: {
  plan: number;
  event: ServiceEvent;
  canAdd: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const t = useT(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const download = async (file: Attachment) => {
    setError('');
    const response = await protectedFetch(`${attachmentPath(plan, event.id)}/${file.id}`);
    if (!response.ok) return setError(`${t('Download failed')} (${response.status})`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Stack spacing={1}>
      {error && <Alert severity="error">{error}</Alert>}
      {event.attachments.map((file) => (
        <Stack
          key={file.id}
          direction="row"
          sx={{
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Button size="small" onClick={() => void download(file)}>
            {file.filename}
          </Button>
          <Typography variant="body2">
            {file.contentType} · {(file.size / 1024).toFixed(1)} KiB · SHA-256{' '}
            {file.sha256.slice(0, 12)}…
          </Typography>
        </Stack>
      ))}
      {canAdd && event.attachments.length < 10 && (
        <Button component="label" size="small" disabled={busy}>
          {t('Attach photo, PDF or text', 'Foto, PDF oder Text anhängen')}
          <input
            hidden
            type="file"
            accept="image/png,image/jpeg,application/pdf,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBusy(true);
              setError('');
              void protectedFetch(attachmentPath(plan, event.id), {
                method: 'POST',
                body: file,
                headers: {
                  'Content-Type': file.type || 'application/octet-stream',
                  'X-Filename': encodeURIComponent(file.name),
                },
              })
                .then(async (response) => {
                  if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.error ?? `HTTP ${response.status}`);
                  }
                  await onSaved();
                })
                .catch((failure) => setError(String(failure)))
                .finally(() => setBusy(false));
            }}
          />
        </Button>
      )}
    </Stack>
  );
}
interface Plan {
  id: number;
  version: number;
  config: Config;
  status: string;
  dueDate: string | null;
  events: ServiceEvent[];
  usage: {
    runtimeSeconds: { observed: number | null; complete: boolean };
    cycles: { observed: number | null; complete: boolean };
    start: string;
    end: string;
  };
}
const initial: Config = {
  name: '',
  days: 7,
  runtimeHours: null,
  cycles: null,
  checks: [],
  active: true,
};
/**
 *
 * @param root0
 * @param root0.machineId
 */
export default function MaintenancePanel({ machineId }: { machineId: number }) {
  const t = useT(),
    user = useAuthStore((s) => s.user),
    role = user?.role,
    edit = !user?.recoveryMode && (role === 'admin' || role === 'supervisor'),
    operate = !user?.recoveryMode && (edit || role === 'operator');
  const [config, setConfig] = useState<Config>(initial),
    [selected, setSelected] = useState(''),
    [checkText, setCheckText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const plans = useQuery({
    queryKey: ['maintenance', machineId],
    queryFn: () => operationRequest<Plan[]>(`/maintenance/machines/${machineId}`),
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
  return (
    <Stack spacing={3}>
      <Typography variant="h5">{t('Maintenance')}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {plans.error && <Alert severity="error">{String(plans.error)}</Alert>}
      {message && (
        <Alert role="status" severity="success">
          {message}
        </Alert>
      )}
      <Alert severity="info">
        {t(
          'Runtime and cycles are observed minimums. Missing history can leave service status unknown. Failed inspections do not reset the service interval.',
          'Laufzeit und Zyklen sind beobachtete Mindestwerte. Fehlende Historie kann den Wartungsstatus unbekannt lassen. Fehlgeschlagene Prüfungen setzen das Wartungsintervall nicht zurück.',
        )}
      </Alert>
      {plans.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
      {plans.data?.map((plan) => (
        <Paper key={plan.id} sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack
              direction="row"
              sx={{
                gap: 2,
                alignItems: 'center',
              }}
            >
              <Typography variant="h6">{plan.config.name}</Typography>
              <Chip
                label={t(
                  plan.status,
                  {
                    due: 'fällig',
                    unknown: 'unbekannt',
                    'not-due': 'nicht fällig',
                    inactive: 'inaktiv',
                  }[plan.status],
                )}
                color={
                  plan.status === 'due' ? 'warning' : plan.status === 'unknown' ? 'default' : 'info'
                }
              />
            </Stack>
            <Typography>
              {t('Next calendar due date', 'Nächster Fälligkeitstermin')}:{' '}
              {plan.dueDate
                ? new Date(plan.dueDate).toLocaleString(useLanguage.getState().language)
                : '—'}
            </Typography>
            <Typography>
              {t('Observed runtime hours', 'Beobachtete Laufzeitstunden')}:{' '}
              {plan.usage.runtimeSeconds.observed == null
                ? t('Unknown')
                : (plan.usage.runtimeSeconds.observed / 3600).toLocaleString(
                    useLanguage.getState().language,
                    { maximumFractionDigits: 2 },
                  )}{' '}
              · {t('Observed cycles', 'Beobachtete Zyklen')}:{' '}
              {plan.usage.cycles.observed ?? t('Unknown')}
            </Typography>
            {operate && plan.config.active && (
              <Inspection plan={plan} machineId={machineId} onSaved={() => plans.refetch()} />
            )}
            <Typography variant="subtitle1">{t('Service history', 'Wartungshistorie')}</Typography>
            {!plan.events.length && (
              <Typography>{t('No inspections recorded.', 'Keine Prüfungen erfasst.')}</Typography>
            )}
            {plan.events.map((event) => (
              <Paper variant="outlined" sx={{ p: 1.5 }} key={event.id}>
                <Typography>
                  {new Date(event.createdAt).toLocaleString(useLanguage.getState().language)} ·{' '}
                  {t('Author', 'Autor')} {event.createdBy} ·{' '}
                  {event.serviced
                    ? t('Service completed', 'Wartung abgeschlossen')
                    : t('Inspection only', 'Nur Prüfung')}
                </Typography>
                <Typography>{event.note}</Typography>
                {Object.entries(event.checks).map(([label, passed]) => (
                  <Typography key={label}>
                    {label}: {passed ? t('Passed', 'Bestanden') : t('Failed', 'Nicht bestanden')}
                  </Typography>
                ))}
                {event.incidentId && (
                  <Typography>
                    {t('Linked incident', 'Verknüpfter Vorfall')} #{event.incidentId}
                  </Typography>
                )}
                {event.stop && (
                  <Typography>
                    {t('Linked stop', 'Verknüpfter Stopp')}:{' '}
                    <Link to={`/production?shift=${event.stop.shiftId}`}>
                      {event.stop.reason} · {event.stop.shiftName}
                    </Link>{' '}
                    ({new Date(event.stop.start).toLocaleString(useLanguage.getState().language)} –{' '}
                    {new Date(event.stop.end).toLocaleString(useLanguage.getState().language)})
                  </Typography>
                )}
                {event.trendStart && event.trendEnd && (
                  <Typography>
                    {t('Linked trend', 'Verknüpfter Verlauf')}:{' '}
                    <Link
                      to={`/production?${new URLSearchParams({
                        replay: '1',
                        machine: String(machineId),
                        keys: (event.trendKeys ?? []).join(','),
                        start: event.trendStart,
                        end: event.trendEnd,
                      })}`}
                    >
                      {(event.trendKeys ?? []).join(', ')}
                    </Link>
                  </Typography>
                )}
                <Attachments
                  plan={plan.id}
                  event={event}
                  canAdd={operate}
                  onSaved={() => plans.refetch()}
                />
              </Paper>
            ))}
          </Stack>
        </Paper>
      ))}
      {edit && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h6">{t('Service plan', 'Wartungsplan')}</Typography>
            <TextField
              select
              label={t('Plan to edit', 'Plan bearbeiten')}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                const value =
                  plans.data?.find((p) => p.id === Number(e.target.value))?.config ?? initial;
                setConfig(value);
                setCheckText(value.checks.join('\n'));
              }}
            >
              <MenuItem value="">{t('New service plan', 'Neuer Wartungsplan')}</MenuItem>
              {plans.data?.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.config.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={t('Service name', 'Wartungsname')}
              value={config.name}
              onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
            />
            {(
              [
                [
                  'days',
                  config.days,
                  'Interval in days (optional)',
                  'Intervall in Tagen (optional)',
                ],
                [
                  'runtimeHours',
                  config.runtimeHours,
                  'Runtime hours (optional)',
                  'Laufzeitstunden (optional)',
                ],
                ['cycles', config.cycles, 'Cycles (optional)', 'Zyklen (optional)'],
              ] as const
            ).map(([key, value, english, german]) => (
              <TextField
                key={key}
                type="number"
                label={t(english, german)}
                value={value ?? ''}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    [key]: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            ))}
            <TextField
              multiline
              minRows={3}
              label={t('Inspection items, one per line', 'Prüfpunkte, einer pro Zeile')}
              value={checkText}
              onChange={(e) => setCheckText(e.target.value)}
            />
            <FormControlLabel
              label={t('Plan active', 'Plan aktiv')}
              control={
                <Checkbox
                  checked={config.active}
                  onChange={(e) => setConfig((c) => ({ ...c, active: e.target.checked }))}
                />
              }
            />
            <Button
              disabled={busy || !config.name || !checkText.trim()}
              onClick={() =>
                void run(async () => {
                  const current = plans.data?.find((p) => p.id === Number(selected));
                  await operationRequest(`/maintenance/machines/${machineId}`, 'POST', {
                    ...(current ? { id: current.id, version: current.version } : {}),
                    config: {
                      ...config,
                      checks: checkText
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  });
                  await plans.refetch();
                  setSelected('');
                  setConfig(initial);
                  setCheckText('');
                  setMessage(t('Service plan saved.', 'Wartungsplan gespeichert.'));
                })
              }
            >
              {t('Save service plan', 'Wartungsplan speichern')}
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
/**
 *
 * @param root0
 * @param root0.plan
 * @param root0.machineId
 * @param root0.onSaved
 */
function Inspection({
  plan,
  machineId,
  onSaved,
}: {
  plan: Plan;
  machineId: number;
  onSaved: () => Promise<unknown>;
}) {
  const t = useT(),
    [checks, setChecks] = useState(new Map<string, boolean>()),
    [note, setNote] = useState(''),
    [incident, setIncident] = useState(''),
    [stop, setStop] = useState(''),
    [trend, setTrend] = useState({ start: '', end: '', keys: '' }),
    [serviced, setServiced] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [requestId, setRequestId] = useState(crypto.randomUUID());
  const incidents = useQuery({
    queryKey: ['maintenance-incidents', machineId],
    queryFn: () =>
      operationRequest<{ entries: { id: number; text: string }[]; truncated: boolean }>(
        `/production/operator/entries?machineId=${machineId}`,
      ),
  });
  const stops = useQuery({
    queryKey: ['maintenance-stops', machineId],
    queryFn: () => operationRequest<Stop[]>(`/maintenance/machines/${machineId}/stops`),
  });
  const trendKeys = trend.keys
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const trendReady =
    !trend.start && !trend.end ? true : !!(trend.start && trend.end && trendKeys.length);
  // Keep the request ID for retries; changing evidence creates a new operation.
  const changed = () => setRequestId(crypto.randomUUID());
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1">{t('Record inspection', 'Prüfung erfassen')}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {plan.config.checks.map((label) => (
        <FormControlLabel
          key={label}
          label={label}
          control={
            <Checkbox
              checked={checks.get(label) ?? false}
              onChange={(e) => {
                changed();
                setChecks((c) => new Map(c).set(label, e.target.checked));
              }}
            />
          }
        />
      ))}
      <TextField
        label={t('Service note', 'Wartungsnotiz')}
        multiline
        value={note}
        onChange={(e) => {
          changed();
          setNote(e.target.value);
        }}
      />
      <TextField
        select
        label={t('Linked incident (optional)', 'Verknüpfter Vorfall (optional)')}
        value={incident}
        onChange={(e) => {
          changed();
          setIncident(e.target.value);
        }}
      >
        <MenuItem value="">{t('None', 'Keine')}</MenuItem>
        {incidents.data?.entries.map((i) => (
          <MenuItem key={i.id} value={i.id}>
            #{i.id} {i.text}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label={t('Linked stop (optional)', 'Verknüpfter Stopp (optional)')}
        value={stop}
        onChange={(e) => {
          changed();
          setStop(e.target.value);
        }}
      >
        <MenuItem value="">{t('None', 'Keine')}</MenuItem>
        {stops.data?.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.reason} · {s.shiftName} ·{' '}
            {new Date(s.start).toLocaleString(useLanguage.getState().language)}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label={t('Trend window start (optional)', 'Beginn des Verlaufs (optional)')}
          type="datetime-local"
          value={trend.start}
          onChange={(e) => {
            changed();
            setTrend({ ...trend, start: e.target.value });
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label={t('Trend window end', 'Ende des Verlaufs')}
          type="datetime-local"
          value={trend.end}
          onChange={(e) => {
            changed();
            setTrend({ ...trend, end: e.target.value });
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label={t('Trend signals (comma separated)', 'Verlaufssignale (kommagetrennt)')}
          value={trend.keys}
          onChange={(e) => {
            changed();
            setTrend({ ...trend, keys: e.target.value });
          }}
        />
      </Stack>
      <FormControlLabel
        label={t(
          'Service completed; start the next interval',
          'Wartung abgeschlossen; nächstes Intervall starten',
        )}
        control={
          <Checkbox
            checked={serviced}
            onChange={(e) => {
              changed();
              setServiced(e.target.checked);
            }}
          />
        }
      />
      <Button
        disabled={
          busy ||
          !note.trim() ||
          !trendReady ||
          (serviced && plan.config.checks.some((c) => !checks.get(c)))
        }
        onClick={() => {
          setBusy(true);
          setError('');
          void operationRequest(`/maintenance/plans/${plan.id}/events`, 'POST', {
            requestId,
            version: plan.version,
            serviced,
            checks: Object.fromEntries(plan.config.checks.map((c) => [c, checks.get(c) ?? false])),
            note,
            incidentId: incident ? Number(incident) : null,
            stopId: stop ? Number(stop) : null,
            trend: trend.start
              ? { start: toIso(trend.start), end: toIso(trend.end), keys: trendKeys }
              : null,
          })
            .then(async () => {
              setNote('');
              setChecks(new Map());
              setStop('');
              setTrend({ start: '', end: '', keys: '' });
              setServiced(false);
              setRequestId(crypto.randomUUID());
              await onSaved();
            })
            .catch((e) => setError(String(e)))
            .finally(() => setBusy(false));
        }}
      >
        {t('Save inspection', 'Prüfung speichern')}
      </Button>
    </Stack>
  );
}
