import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { formatNumber, useLanguage, useT } from '@/i18n';
import { localInput, operationRequest, toIso } from './api';

interface SavedRevision {
  revisionId: number;
  shiftId: number;
  shiftName: string;
  start: string;
  end: string;
}
interface SideContext {
  shifts: number;
  scheduledHours: number;
  productMix: Record<string, number>;
  meterCoverage: number;
}
interface Action {
  id: number;
  title: string;
  description: string;
  implementedAt: string;
  beforeRevisionIds: number[];
  afterRevisionIds: number[];
  /** Why the action cannot be evaluated, such as a revision that no longer verifies. */
  problem?: string;
  evaluation: null | {
    comparable: boolean;
    reasons: string[];
    context: { before: SideContext; after: SideContext };
    metrics: {
      key: string;
      before: number | null;
      after: number | null;
      delta: number | null;
      reasons: string[];
    }[];
  };
}
const metricNames: Record<string, [string, string]> = {
  goodPerScheduledHour: ['Good parts per scheduled hour', 'Gutteile je geplanter Stunde'],
  availability: ['Availability', 'Verfügbarkeit'],
  idleFaultShare: ['Idle and fault share', 'Anteil Leerlauf und Störung'],
  kWhPerGoodPart: ['kWh per good part', 'kWh je Gutteil'],
};
const mix = (context: SideContext) =>
  Object.entries(context.productMix)
    .map(([key, share]) => {
      const [product, cycle] = JSON.parse(key) as [string, number];
      return `${product} (${cycle} ms) ${(share * 100).toFixed(0)}%`;
    })
    .join(', ');

/**
 * Records an improvement action and compares frozen shift revisions before and after it.
 * @param root0
 * @param root0.machineId
 */
export default function ImprovementActionsPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    language = useLanguage((s) => s.language);
  const [form, setForm] = useState({
      title: '',
      description: '',
      implementedAt: localInput(new Date().toISOString()),
    }),
    [before, setBefore] = useState<number[]>([]),
    [after, setAfter] = useState<number[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const revisions = useQuery({
    queryKey: ['comparison-revisions', machineId],
    queryFn: () =>
      operationRequest<SavedRevision[]>(`/comparisons/machines/${machineId}/revisions`),
  });
  const actions = useQuery({
    queryKey: ['improvement-actions', machineId],
    queryFn: () => operationRequest<Action[]>(`/comparisons/machines/${machineId}/actions`),
  });
  const number = (value: number | null, digits = 2) =>
    value == null ? '–' : formatNumber(value, digits);
  const pick = (
    list: number[],
    set: (next: number[]) => void,
    other: number[],
    setOther: (next: number[]) => void,
    id: number,
    on: boolean,
  ) => {
    set(on ? [...list, id] : list.filter((x) => x !== id));
    if (on) setOther(other.filter((x) => x !== id));
  };
  const date = (iso: string) => new Date(iso).toLocaleString(language);
  return (
    <Stack spacing={2}>
      <Typography variant="h5">{t('Improvement actions', 'Verbesserungsmaßnahmen')}</Typography>
      <Alert severity="info">
        {t(
          'Compare saved shift revisions before and after an action, per scheduled hour. Product mix, operating hours and meter coverage stay visible; a difference is an association with the action, not proof that the action caused it.',
          'Gespeicherte Schichtrevisionen vor und nach einer Maßnahme je geplanter Stunde vergleichen. Produktmix, Betriebsstunden und Zählerabdeckung bleiben sichtbar; ein Unterschied ist ein Zusammenhang mit der Maßnahme, kein Beweis, dass sie ihn verursacht hat.',
        )}
      </Alert>
      {(error || actions.error || revisions.error) && (
        <Alert severity="error">{error || String(actions.error || revisions.error)}</Alert>
      )}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label={t('Action title', 'Titel der Maßnahme')}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <TextField
            label={t('What changed and the expected effect', 'Änderung und erwartete Wirkung')}
            multiline
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <TextField
            label={t('Implemented at', 'Umgesetzt am')}
            type="datetime-local"
            value={form.implementedAt}
            onChange={(e) => setForm({ ...form, implementedAt: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Typography variant="subtitle1">
            {t('Saved shift revisions', 'Gespeicherte Schichtrevisionen')}
          </Typography>
          {revisions.data?.length === 0 && (
            <Typography>
              {t(
                'Save shift report revisions in Planning first.',
                'Zuerst in der Planung Schichtrevisionen speichern.',
              )}
            </Typography>
          )}
          {revisions.data?.map((r) => (
            <Stack key={r.revisionId} direction="row" alignItems="center" flexWrap="wrap" gap={1}>
              <Typography sx={{ minWidth: 260 }}>
                {r.shiftName} · {date(r.start)}
              </Typography>
              <FormControlLabel
                label={t('Before', 'Vorher')}
                control={
                  <Checkbox
                    checked={before.includes(r.revisionId)}
                    onChange={(e) =>
                      pick(before, setBefore, after, setAfter, r.revisionId, e.target.checked)
                    }
                    slotProps={{ input: { 'aria-label': `${t('Before')} ${r.shiftName}` } }}
                  />
                }
              />
              <FormControlLabel
                label={t('After', 'Nachher')}
                control={
                  <Checkbox
                    checked={after.includes(r.revisionId)}
                    onChange={(e) =>
                      pick(after, setAfter, before, setBefore, r.revisionId, e.target.checked)
                    }
                    slotProps={{ input: { 'aria-label': `${t('After')} ${r.shiftName}` } }}
                  />
                }
              />
            </Stack>
          ))}
          <Button
            variant="contained"
            disabled={busy || !form.title || !form.description || !before.length || !after.length}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await operationRequest(`/comparisons/machines/${machineId}/actions`, 'POST', {
                  ...form,
                  implementedAt: toIso(form.implementedAt),
                  beforeRevisionIds: before,
                  afterRevisionIds: after,
                });
                setForm({ ...form, title: '', description: '' });
                setBefore([]);
                setAfter([]);
                await actions.refetch();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Record improvement action', 'Verbesserungsmaßnahme erfassen')}
          </Button>
        </Stack>
      </Paper>
      {actions.data?.map((action) => (
        <Paper key={action.id} sx={{ p: 2, overflowX: 'auto' }}>
          <Stack spacing={1}>
            <Typography variant="h6">{action.title}</Typography>
            <Typography>
              {date(action.implementedAt)} · {action.description}
            </Typography>
            {!action.evaluation && <Alert severity="error">{action.problem}</Alert>}
            {action.evaluation && !action.evaluation.comparable && (
              <Alert severity="warning">
                {t('Not comparable:', 'Nicht vergleichbar:')} {action.evaluation.reasons.join(', ')}
              </Alert>
            )}
            {action.evaluation &&
              [
                [t('Before', 'Vorher'), action.evaluation.context.before] as const,
                [t('After', 'Nachher'), action.evaluation.context.after] as const,
              ].map(([label, side]) => (
                <Typography key={label} variant="body2">
                  {label}: {side.shifts} {t('shifts', 'Schichten')},{' '}
                  {number(side.scheduledHours, 1)} {t('scheduled hours', 'geplante Stunden')},{' '}
                  {t('mix', 'Mix')} {mix(side)}, {t('meter coverage', 'Zählerabdeckung')}{' '}
                  {(side.meterCoverage * 100).toFixed(0)}%
                </Typography>
              ))}
            {action.evaluation && (
              <Box
                component="table"
                aria-label={`${t('Before and after', 'Vorher und nachher')}: ${action.title}`}
                sx={{ borderCollapse: 'collapse', '& td, & th': { pr: 2, textAlign: 'left' } }}
              >
                <thead>
                  <tr>
                    <th>{t('Measure', 'Kennzahl')}</th>
                    <th>{t('Before', 'Vorher')}</th>
                    <th>{t('After', 'Nachher')}</th>
                    <th>{t('Difference', 'Differenz')}</th>
                  </tr>
                </thead>
                <tbody>
                  {action.evaluation.metrics.map((m) => (
                    <tr key={m.key}>
                      <td>{t(...(metricNames[m.key] ?? [m.key, m.key]))}</td>
                      <td>{number(m.before)}</td>
                      <td>{number(m.after)}</td>
                      <td>{m.delta == null ? `– (${m.reasons.join(', ')})` : number(m.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
