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
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { operationRequest } from './api';
interface Config {
  name: string;
  days: number | null;
  runtimeHours: number | null;
  cycles: number | null;
  checks: string[];
  active: boolean;
}
interface ServiceEvent {
  id: number;
  createdAt: string;
  createdBy: number;
  note: string;
  serviced: boolean;
  checks: Record<string, boolean>;
  incidentId: number | null;
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
            <Stack direction="row" gap={2} alignItems="center">
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
          busy || !note.trim() || (serviced && plan.config.checks.some((c) => !checks.get(c)))
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
          })
            .then(async () => {
              setNote('');
              setChecks(new Map());
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
