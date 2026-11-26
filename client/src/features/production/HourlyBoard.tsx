import React from 'react';
import { Box, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { translate as t, useLanguage } from '@/i18n';
import { productionRequest } from './productionApi';
import { parts } from '@/utils/insightFormat';

interface HourRow {
  start: string;
  end: string;
  planned: number;
  good: number | null;
  cumulativePlanned: number;
  cumulativeGood: number | null;
  unknownSeconds: number | null;
  largestLoss: { reason: string; seconds: number } | null;
}

/**
 * Hour-by-hour plan against measured good parts, refreshed every minute.
 * @param root0
 * @param root0.shiftId
 * @param root0.timezone
 */
export const HourlyBoard: React.FC<{ shiftId: string; timezone?: string }> = ({
  shiftId,
  timezone,
}) => {
  const board = useQuery({
    queryKey: ['hourly', shiftId],
    queryFn: () => productionRequest<{ hours: HourRow[] }>(`/shifts/${shiftId}/hourly`),
    refetchInterval: 60_000,
  });
  if (!board.data?.hours.length) return null;
  return (
    <Box>
      <Typography variant="h6">{t('Hour-by-hour plan and actual')}</Typography>
      <Box
        component="table"
        aria-label={t('Hour-by-hour plan and actual')}
        sx={{ borderCollapse: 'collapse', '& td, & th': { px: 1, py: 0.5, textAlign: 'right' } }}
      >
        <thead>
          <tr>
            {['Hour', 'Plan', 'Good', 'Total plan', 'Total good', 'Gap', 'Largest loss'].map(
              (h) => (
                <th key={h}>{t(h)}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {board.data.hours.map((hour) => {
            const gap =
              hour.cumulativeGood == null ? null : hour.cumulativeGood - hour.cumulativePlanned;
            return (
              <tr key={hour.start}>
                <td>
                  {new Date(hour.start).toLocaleTimeString(useLanguage.getState().language, {
                    timeStyle: 'short',
                    timeZone: timezone,
                  })}
                </td>
                <td>{parts(hour.planned)}</td>
                <td>{parts(hour.good)}</td>
                <td>{parts(hour.cumulativePlanned)}</td>
                <td>{parts(hour.cumulativeGood)}</td>
                <Box
                  component="td"
                  sx={{ color: gap != null && gap < 0 ? 'error.main' : undefined }}
                >
                  {gap == null ? '—' : (gap > 0 ? '+' : '') + Math.round(gap)}
                </Box>
                <Box component="td" sx={{ textAlign: 'left !important' }}>
                  {hour.largestLoss
                    ? `${hour.largestLoss.reason} (${Math.round(hour.largestLoss.seconds / 60)} ${t('min')})`
                    : ''}
                </Box>
              </tr>
            );
          })}
        </tbody>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {t(
          'Plan spreads the target (or the ideal rate) over time outside breaks. Good parts use the shift report rules; an hour with unknown counts makes the running total unknown.',
        )}
      </Typography>
    </Box>
  );
};
