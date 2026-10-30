import React, { useState } from 'react';
import { Alert, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { formatNumber, useLanguage, useT } from '@/i18n';
import { operationRequest } from './api';

type Hours = { fast: number | null; median: number | null; slow: number | null };
interface Forecast {
  advisory: string;
  basis: string;
  products: string[];
  processChange: { implementedAt: string; title: string } | null;
  minimumRuns: number;
  comparableRuns: number | null;
  excluded: Record<string, number> | null;
  failedIntegrity: number;
  estimate:
    | { status: 'withheld'; reason: string }
    | { status: 'estimate'; hours: Hours; ratePerHour: Hours & { slow: number } }
    | null;
  backtest: {
    evaluated: number;
    intervalCoverage: number | null;
    medianAbsErrorHours: number | null;
    benchmarkMedianAbsErrorHours: number | null;
  } | null;
}

/**
 * X04: advisory completion estimate from comparable verified runs.
 * @param root0
 * @param root0.machineId
 */
export default function CompletionForecastPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    language = useLanguage((s) => s.language);
  const [product, setProduct] = useState(''),
    [remaining, setRemaining] = useState('');
  const query = new URLSearchParams({
    ...(product ? { product } : {}),
    ...(Number(remaining) > 0 ? { remaining: String(Math.round(Number(remaining))) } : {}),
  });
  const data = useQuery({
    queryKey: ['completion-forecast', machineId, product, remaining],
    queryFn: () =>
      operationRequest<Forecast>(`/forecasts/machines/${machineId}/completion?${query}`),
  }).data;
  const hours = (value: number | null) =>
    value == null ? t('open-ended', 'offen') : `${formatNumber(value, 1)} h`;
  const estimate = data?.estimate;
  return (
    <Stack spacing={2}>
      <Typography variant="h5">{t('Completion forecast', 'Fertigstellungsprognose')}</Typography>
      <Alert severity="info">
        {t(
          'Advisory only: an estimate from comparable verified runs after the latest declared process change. It does not reschedule, plan or control anything.',
          'Nur zur Orientierung: eine Schätzung aus vergleichbaren verifizierten Läufen nach der letzten erklärten Prozessänderung. Sie plant, verschiebt oder steuert nichts.',
        )}
      </Alert>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          select
          label={t('Product', 'Produkt')}
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          {(data?.products ?? []).map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="number"
          label={t('Remaining good parts', 'Verbleibende Gutteile')}
          value={remaining}
          onChange={(e) => setRemaining(e.target.value)}
          slotProps={{ htmlInput: { min: 1 } }}
        />
      </Stack>
      {data?.processChange && (
        <Typography variant="body2">
          {t('Comparable since the process change', 'Vergleichbar seit der Prozessänderung')} “
          {data.processChange.title}” (
          {new Date(data.processChange.implementedAt).toLocaleString(language)})
        </Typography>
      )}
      {product && data && (
        <Typography variant="body2" role="status">
          {t('Comparable verified runs', 'Vergleichbare verifizierte Läufe')}: {data.comparableRuns}{' '}
          ({t('minimum', 'Minimum')} {data.minimumRuns}) · {t('not used', 'nicht verwendet')}:{' '}
          {Object.entries(data.excluded ?? {})
            .filter(([, n]) => n > 0)
            .map(([reason, n]) => `${reason} ${n}`)
            .join(', ') || '–'}
          {data.failedIntegrity
            ? ` · ${t('revisions failing integrity', 'Revisionen ohne Integrität')} ${data.failedIntegrity}`
            : ''}
        </Typography>
      )}
      {estimate?.status === 'withheld' && (
        <Alert severity="warning">
          {t('No estimate', 'Keine Schätzung')}: {estimate.reason}
        </Alert>
      )}
      {estimate?.status === 'estimate' && (
        <Alert severity="success">
          {t('Estimated planned hours', 'Geschätzte geplante Stunden')}:{' '}
          {hours(estimate.hours.median)} ({t('range', 'Spanne')} {hours(estimate.hours.fast)} –{' '}
          {hours(estimate.hours.slow)})
        </Alert>
      )}
      {data?.backtest && (
        <Typography variant="body2">
          {t(
            'Backtest on this installation’s runs',
            'Rückblickender Test mit den Läufen dieser Installation',
          )}
          : {data.backtest.evaluated} {t('runs predicted', 'Läufe vorhergesagt')}
          {data.backtest.intervalCoverage != null &&
            ` · ${t('inside the range', 'innerhalb der Spanne')} ${formatNumber(data.backtest.intervalCoverage * 100, 0)} % · ${t('median error', 'Median-Fehler')} ${hours(data.backtest.medianAbsErrorHours)} (${t('mean-rate benchmark', 'Vergleich mit Mittelwert')} ${hours(data.backtest.benchmarkMedianAbsErrorHours)})`}
        </Typography>
      )}
      {data && <Typography variant="caption">{data.basis}</Typography>}
    </Stack>
  );
}
