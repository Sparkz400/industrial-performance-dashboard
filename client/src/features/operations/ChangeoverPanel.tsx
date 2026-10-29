import React, { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeoverAnalysis } from '@performance-dashboard/shared';
import { useLanguage, useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { localInput, operationRequest, toIso } from './api';

interface Standard {
  id: number;
  fromProduct: string;
  toProduct: string;
  expectedSeconds: number;
  note: string | null;
  createdAt: string;
}
const minutes = (seconds: number | null, sign = false) =>
  seconds == null ? '–' : `${sign && seconds > 0 ? '+' : ''}${(seconds / 60).toFixed(1)} min`;
const tableSx = {
  borderCollapse: 'collapse',
  width: '100%',
  '& td, & th': { pr: 2, py: 0.5, textAlign: 'left', verticalAlign: 'top' },
  '& th': { whiteSpace: 'nowrap' },
} as const;
const emptyStandard = { fromProduct: '', toProduct: '', minutes: '', note: '' };

/**
 * Expected-versus-actual changeovers between product runs, grouped by product transition.
 * @param root0
 * @param root0.machineId
 */
export default function ChangeoverPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    language = useLanguage((s) => s.language),
    queryClient = useQueryClient(),
    user = useAuthStore((s) => s.user),
    edit = !user?.recoveryMode && ['admin', 'supervisor'].includes(user?.role ?? '');
  const [start, setStart] = useState(localInput(new Date(Date.now() - 7 * 86400000).toISOString())),
    [end, setEnd] = useState(localInput(new Date().toISOString())),
    [analysis, setAnalysis] = useState<ChangeoverAnalysis | null>(null),
    [standard, setStandard] = useState(emptyStandard),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const standards = useQuery({
    queryKey: ['changeover-standards', machineId],
    queryFn: () =>
      operationRequest<Standard[]>(`/planning/machines/${machineId}/changeover-standards`),
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
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString(language) : '–');
  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="h5">{t('Changeovers', 'Umrüstungen')}</Typography>
      <Alert severity="info">
        {t(
          'A changeover runs from the last running state of one product run to the first running state of the next product, minus scheduled breaks. Only the same product transition on this machine is compared; operators and unrelated jobs are not ranked. Unknown state, runs without running state and transitions between shifts are listed but not measured.',
          'Eine Umrüstung reicht vom letzten Laufzustand eines Produktlaufs bis zum ersten Laufzustand des nächsten Produkts, abzüglich geplanter Pausen. Verglichen wird nur derselbe Produktwechsel an dieser Maschine; Bedienende und fremde Aufträge werden nicht gereiht. Unbekannter Zustand, Läufe ohne Laufzustand und Wechsel zwischen Schichten werden aufgeführt, aber nicht gemessen.',
        )}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert role="status" severity="success">
          {message}
        </Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label={t('Changeover window start', 'Beginn des Umrüstzeitraums')}
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label={t('Changeover window end', 'Ende des Umrüstzeitraums')}
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button
          variant="contained"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              setAnalysis(
                await operationRequest<ChangeoverAnalysis>(
                  `/planning/machines/${machineId}/changeovers?start=${encodeURIComponent(toIso(start))}&end=${encodeURIComponent(toIso(end))}`,
                ),
              ),
            )
          }
        >
          {t('Analyze changeovers', 'Umrüstungen auswerten')}
        </Button>
      </Stack>
      {analysis && (
        <>
          {analysis.truncated && (
            <Alert severity="warning">
              {t(
                'Only the first 100 shifts were analyzed; narrow the window.',
                'Nur die ersten 100 Schichten wurden ausgewertet; Zeitraum verkleinern.',
              )}
            </Alert>
          )}
          <Paper sx={{ p: 2, overflowX: 'auto' }}>
            <Typography variant="h6">
              {t('Comparable changeovers', 'Vergleichbare Umrüstungen')}
            </Typography>
            {analysis.groups.length ? (
              <Box
                component="table"
                aria-label={t('Comparable changeovers', 'Vergleichbare Umrüstungen')}
                sx={tableSx}
              >
                <thead>
                  <tr>
                    <th>{t('Transition', 'Wechsel')}</th>
                    <th>{t('Measured', 'Gemessen')}</th>
                    <th>{t('Median actual', 'Median Ist')}</th>
                    <th>{t('Standard', 'Standard')}</th>
                    <th>{t('Median difference', 'Median Abweichung')}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.groups.map((g) => (
                    <tr key={`${g.fromProduct}\u0000${g.toProduct}`}>
                      <td>
                        {g.fromProduct} → {g.toProduct}
                      </td>
                      <td>
                        {g.observed} / {g.transitions}
                      </td>
                      <td>{minutes(g.medianActualSeconds)}</td>
                      <td>{minutes(g.expectedSeconds)}</td>
                      <td>{minutes(g.medianDifferenceSeconds, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>
            ) : (
              <Typography>
                {t('No product transitions in this window.', 'Keine Produktwechsel im Zeitraum.')}
              </Typography>
            )}
          </Paper>
          {analysis.transitions.length > 0 && (
            <Paper sx={{ p: 2, overflowX: 'auto' }}>
              <Typography variant="h6">{t('Product transitions', 'Produktwechsel')}</Typography>
              <Box
                component="table"
                aria-label={t('Product transitions', 'Produktwechsel')}
                sx={tableSx}
              >
                <thead>
                  <tr>
                    <th>{t('Shift', 'Schicht')}</th>
                    <th>{t('Transition', 'Wechsel')}</th>
                    <th>{t('Stopped', 'Gestoppt')}</th>
                    <th>{t('Resumed', 'Wieder gelaufen')}</th>
                    <th>{t('Actual', 'Ist')}</th>
                    <th>{t('Breaks', 'Pausen')}</th>
                    <th>{t('Confirmed as changeover', 'Als Umrüstung bestätigt')}</th>
                    <th>{t('Result', 'Ergebnis')}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.transitions.map((c) => (
                    <tr key={`${c.shiftId}:${c.from.plannedEnd}:${c.to.plannedStart}`}>
                      <td>{c.shiftName}</td>
                      <td>
                        {c.from.product} → {c.to.product}
                      </td>
                      <td>{time(c.stoppedAt)}</td>
                      <td>{time(c.resumedAt)}</td>
                      <td>{minutes(c.actualSeconds)}</td>
                      <td>{minutes(c.breakSeconds)}</td>
                      <td>{minutes(c.confirmedSeconds)}</td>
                      <td>{c.issue ?? t('Measured', 'Gemessen')}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Paper>
          )}
        </>
      )}
      {edit && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h6">{t('Changeover standard', 'Umrüststandard')}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={t('From product', 'Von Produkt')}
                value={standard.fromProduct}
                onChange={(e) => setStandard({ ...standard, fromProduct: e.target.value })}
              />
              <TextField
                label={t('To product', 'Zu Produkt')}
                value={standard.toProduct}
                onChange={(e) => setStandard({ ...standard, toProduct: e.target.value })}
              />
              <TextField
                label={t('Expected minutes', 'Erwartete Minuten')}
                type="number"
                value={standard.minutes}
                onChange={(e) => setStandard({ ...standard, minutes: e.target.value })}
                slotProps={{ htmlInput: { min: 0.1, step: 0.1 } }}
              />
            </Stack>
            <TextField
              label={t('Basis of the standard', 'Grundlage des Standards')}
              value={standard.note}
              onChange={(e) => setStandard({ ...standard, note: e.target.value })}
            />
            <Button
              variant="contained"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await operationRequest(
                    `/planning/machines/${machineId}/changeover-standards`,
                    'POST',
                    {
                      fromProduct: standard.fromProduct,
                      toProduct: standard.toProduct,
                      expectedSeconds: Math.round(Number(standard.minutes) * 60),
                      note: standard.note,
                    },
                  );
                  setStandard(emptyStandard);
                  setMessage(t('Changeover standard saved', 'Umrüststandard gespeichert'));
                  await queryClient.invalidateQueries({
                    queryKey: ['changeover-standards', machineId],
                  });
                })
              }
            >
              {t('Save changeover standard', 'Umrüststandard speichern')}
            </Button>
          </Stack>
        </Paper>
      )}
      {!!standards.data?.length && (
        <Paper sx={{ p: 2, overflowX: 'auto' }}>
          <Typography variant="h6">
            {t('Standard history (latest applies)', 'Standardverlauf (neuester gilt)')}
          </Typography>
          <Box
            component="table"
            aria-label={t('Changeover standard history', 'Verlauf der Umrüststandards')}
            sx={tableSx}
          >
            <thead>
              <tr>
                <th>{t('Transition', 'Wechsel')}</th>
                <th>{t('Expected', 'Erwartet')}</th>
                <th>{t('Basis', 'Grundlage')}</th>
                <th>{t('Saved', 'Gespeichert')}</th>
              </tr>
            </thead>
            <tbody>
              {standards.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.fromProduct} → {s.toProduct}
                  </td>
                  <td>{minutes(s.expectedSeconds)}</td>
                  <td>{s.note ?? '–'}</td>
                  <td>{time(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Box>
        </Paper>
      )}
    </Stack>
  );
}
