/* eslint-disable security/detect-object-injection -- State names and indices come only from the fixed state list below. */
import React, { useState } from 'react';
import { Alert, Box, MenuItem, TextField, Typography, LinearProgress } from '@mui/material';
import type { WidgetConfig } from '@/types';
import { useWidgetEvidence } from '../hooks/useWidgetEvidence';
import { useT } from '@/i18n';
/**
 * Show measured state durations including unknown intervals.
 * @param root0 Widget options.
 * @param root0.config Saved machine selection.
 */
export default function OperationModePieWidget({ config = {} }: { config?: WidgetConfig }) {
  const machineId = config.machineId as number | undefined,
    t = useT();
  const { data, isLoading, error } = useWidgetEvidence(machineId);
  const [period, setPeriod] = useState('today');
  const days = period === 'today' ? data?.days.slice(-1) : data?.days;
  const states = ['running', 'idle', 'fault', 'planned', 'unknown'];
  const seconds = states.map((state) =>
    (days ?? []).reduce((sum, day) => sum + day.seconds[state], 0),
  );
  const total = seconds.reduce((a, b) => a + b, 0);
  return (
    <Box sx={{ p: 2, overflow: 'auto', height: '100%' }}>
      <Typography variant="h6">
        {t('Observed state distribution', 'Beobachtete Zustandsverteilung')}
      </Typography>
      {!machineId ? (
        <Alert severity="info">
          {t(
            'Select a machine in widget settings',
            'Maschine in den Widget-Einstellungen auswählen',
          )}
        </Alert>
      ) : isLoading ? (
        <Typography>{t('Loading…', 'Wird geladen…')}</Typography>
      ) : error ? (
        <Alert severity="error">{String(error)}</Alert>
      ) : !data ? (
        <Typography>{t('Unknown', 'Unbekannt')}</Typography>
      ) : (
        <>
          <TextField
            select
            fullWidth
            label={t('Period', 'Zeitraum')}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            sx={{ my: 2 }}
          >
            <MenuItem value="today">{t('Today (UTC)', 'Heute (UTC)')}</MenuItem>
            <MenuItem value="week">{t('Last seven UTC days', 'Letzte sieben UTC-Tage')}</MenuItem>
          </TextField>
          {states.map((state, i) => (
            <Box key={state} sx={{ mb: 1.5 }}>
              <Typography>
                {t(
                  state,
                  (
                    {
                      running: 'Laufend',
                      idle: 'Leerlauf',
                      fault: 'Störung',
                      planned: 'Geplant',
                      unknown: 'Unbekannt',
                    } as Record<string, string>
                  )[state],
                )}
                : {(seconds[i] / 60).toFixed(1)} min
              </Typography>
              <LinearProgress
                aria-label={state}
                variant="determinate"
                value={total ? (seconds[i] / total) * 100 : 0}
                color={state === 'unknown' ? 'warning' : 'primary'}
              />
            </Box>
          ))}
          <Typography variant="caption">
            {data?.profileName} ·{' '}
            {t(
              'Current profile; gaps and bad quality remain unknown.',
              'Aktuelles Profil; Lücken und schlechte Qualität bleiben unbekannt.',
            )}
          </Typography>
        </>
      )}
    </Box>
  );
}
