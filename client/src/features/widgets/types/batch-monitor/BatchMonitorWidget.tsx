import React, { useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Stack,
} from '@mui/material';
import { useActiveBatch, useBatchData } from '@/features/recipes/hooks/useBatchQueries';
import type { WidgetConfig } from '@/types';
import WidgetReadingEvidence from '../WidgetReadingEvidence';
import { widgetReadings } from '../../hooks/widgetReadings';

interface BatchMonitorWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

const BatchMonitorWidget: React.FC<BatchMonitorWidgetProps> = ({ config = {}, onError }) => {
  const machineId = (config.machineId as number) ?? 0;
  const [now, setNow] = React.useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const {
    data: activeBatch,
    isLoading: batchLoading,
    error: batchError,
  } = useActiveBatch(machineId || undefined);
  const {
    data: seriesData,
    isLoading: dataLoading,
    error: dataError,
  } = useBatchData(activeBatch?.id ?? 0);

  useEffect(() => {
    if (batchError && onError) {
      onError(new Error(`Batch Monitor Widget error: ${batchError.message}`));
    }
  }, [batchError, onError]);

  const elapsedTime = useMemo(() => {
    if (!activeBatch?.startedAt) return '-';
    const startMs = new Date(activeBatch.startedAt).getTime();
    const diffMs = Date.now() - startMs;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  }, [activeBatch?.startedAt]);

  if (!machineId) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
          }}
        >
          Select a machine in widget settings
        </Typography>
      </Box>
    );
  }

  if (batchLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (batchError || dataError)
    return (
      <Box sx={{ p: 2 }}>
        <Typography role="status">Batch measurements are unavailable.</Typography>
      </Box>
    );

  if (!activeBatch) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
          }}
        >
          No active batch on this machine.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5, width: '100%', height: '100%', overflow: 'auto' }}>
      {/* Header info */}
      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        <Stack
          direction="row"
          sx={{
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
            }}
          >
            {activeBatch.batchNumber}
          </Typography>
          <Chip label={activeBatch.status} size="small" color="warning" />
        </Stack>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
          }}
        >
          Recipe: {activeBatch.recipeName ?? '-'} (v{activeBatch.recipeVersion ?? '?'})
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
          }}
        >
          Elapsed: {elapsedTime}
        </Typography>
      </Stack>

      {/* Parameter table - derived from time-series data */}
      {dataLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : seriesData && seriesData.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>Parameter</TableCell>
                <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }} align="right">
                  Setpoint
                </TableCell>
                <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }} align="right">
                  Current
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {seriesData.map((series) => {
                const readings = widgetReadings(
                  series.dataPoints.map((point) => ({ ...point, time: point.timestamp })),
                );
                const latest = readings.at(-1);
                const age = latest ? now - Date.parse(latest.timestamp) : NaN;
                const quality = !latest
                  ? 'Missing'
                  : !Number.isFinite(age) || age < -5000
                    ? 'Invalid clock'
                    : age > 60000
                      ? 'Stale'
                      : latest.value == null
                        ? 'Bad or unknown quality'
                        : 'Good';
                const current =
                  latest?.statusCode?.startsWith('Good') &&
                  Number.isFinite(age) &&
                  age >= -5000 &&
                  age <= 60000 &&
                  Number.isFinite(latest.value)
                    ? latest.value
                    : null;
                const inRange =
                  current != null
                    ? Math.abs(current - series.targetValue) <= series.tolerance
                    : null;
                return (
                  <TableRow key={series.nodeKey}>
                    <TableCell sx={{ py: 0.3, fontSize: '0.75rem' }}>
                      {series.displayName}
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                        }}
                      >
                        {quality}
                      </Typography>
                      <WidgetReadingEvidence rows={readings} />
                    </TableCell>
                    <TableCell sx={{ py: 0.3, fontSize: '0.75rem' }} align="right">
                      {series.setpoint != null ? series.setpoint : '-'}
                    </TableCell>
                    <TableCell
                      sx={{
                        py: 0.3,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color:
                          inRange == null
                            ? 'text.secondary'
                            : inRange
                              ? 'success.main'
                              : 'error.main',
                      }}
                      align="right"
                    >
                      {current != null ? current.toFixed(2) : 'Unknown'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            display: 'block',
            textAlign: 'center',
          }}
        >
          No parameter data available.
        </Typography>
      )}
    </Box>
  );
};

export default BatchMonitorWidget;
