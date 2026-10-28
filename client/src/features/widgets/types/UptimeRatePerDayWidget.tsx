import React from 'react';
import { Box, Typography, Alert, LinearProgress } from '@mui/material';
import type { WidgetConfig } from '@/types';
import { useWidgetEvidence } from '../hooks/useWidgetEvidence';
import { useT } from '@/i18n';
/**
 * Show uptime only for fully observed UTC periods.
 * @param root0 Widget options.
 * @param root0.config Saved machine selection.
 */
export default function UptimeRatePerDayWidget({ config = {} }: { config?: WidgetConfig }) {
  const machineId = config.machineId as number | undefined;
  const { data, isLoading, error } = useWidgetEvidence(machineId),
    t = useT();
  return (
    <Box sx={{ p: 2, overflow: 'auto', height: '100%' }}>
      <Typography variant="h6">
        {t('Uptime — last seven UTC days', 'Betriebszeit — letzte sieben UTC-Tage')}
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
          <Typography variant="caption">
            {data.profileName} · {t('Current commissioned profile', 'Aktuell freigegebenes Profil')}
          </Typography>
          {data.days.map((day) => (
            <Box key={day.start} sx={{ my: 1 }}>
              <Typography>
                {day.start.slice(0, 10)}:{' '}
                {day.uptimePercent == null
                  ? t('Unknown', 'Unbekannt')
                  : `${day.uptimePercent.toFixed(1)}%`}
              </Typography>
              {day.uptimePercent != null && (
                <LinearProgress
                  aria-label={`${day.start.slice(0, 10)} uptime`}
                  variant="determinate"
                  value={day.uptimePercent}
                />
              )}
              <Typography variant="caption">
                {t('Coverage', 'Abdeckung')}: {day.coveragePercent.toFixed(1)}% ·{' '}
                {t('Unknown', 'Unbekannt')}: {(day.seconds.unknown / 60).toFixed(1)} min
                {day.corrected > 0 ? ` · ${t('Reviewed corrections', 'Geprüfte Korrekturen')}` : ''}
              </Typography>
            </Box>
          ))}
          <Typography variant="caption">
            {t(
              'Running time / full day. Today ends at the observation time; incomplete days have no uptime percentage.',
              'Laufzeit / ganzer Tag. Heute endet zur Beobachtungszeit; unvollständige Tage haben keinen Betriebszeitanteil.',
            )}
          </Typography>
        </>
      )}
    </Box>
  );
}
