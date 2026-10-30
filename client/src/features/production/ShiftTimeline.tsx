/* eslint-disable security/detect-object-injection -- State keys are the fixed shared ProductionState union. */
import React from 'react';
import { Box, Typography } from '@mui/material';
import type { ShiftReport } from '@performance-dashboard/shared';
import { formatNumber, useT } from '@/i18n';

const colors = {
  running: 'success.main',
  idle: 'warning.main',
  fault: 'error.main',
  planned: 'info.main',
  unknown: 'text.disabled',
};

/**
 *
 * @param root0
 * @param root0.report
 */
export default function ShiftTimeline({ report }: { report: ShiftReport }) {
  const t = useT();
  const start = Date.parse(report.start),
    duration = Date.parse(report.end) - start;
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {t('Machine timeline')}
      </Typography>
      <Box
        role="img"
        aria-label={t(
          'Shift state timeline. Durations are listed below.',
          'Schichtzustände. Die Dauer steht unter der Zeitleiste.',
        )}
        sx={{
          position: 'relative',
          height: 24,
          bgcolor: 'text.disabled',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        {duration > 0 &&
          report.intervals.map((interval) => (
            <Box
              key={interval.start}
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${Math.max(0, ((Date.parse(interval.start) - start) / duration) * 100)}%`,
                width: `${Math.max(0, ((Date.parse(interval.end) - Date.parse(interval.start)) / duration) * 100)}%`,
                bgcolor: colors[interval.state],
              }}
            />
          ))}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        {[report.start, report.end].map((time) => (
          <Typography variant="caption" key={time}>
            {new Date(time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: report.timezone,
            })}
          </Typography>
        ))}
      </Box>
      <Box component="dl" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, my: 1 }}>
        {(Object.keys(colors) as (keyof typeof colors)[]).map((state) => (
          <Box key={state}>
            <Typography component="dt" variant="caption">
              {t(state)}
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(report.seconds[state] / 60)} {t('min')}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('Unknown time is not downtime.', 'Unbeobachtete Zeit ist keine Stillstandszeit.')} ·{' '}
        {report.timezone}
      </Typography>
    </Box>
  );
}
