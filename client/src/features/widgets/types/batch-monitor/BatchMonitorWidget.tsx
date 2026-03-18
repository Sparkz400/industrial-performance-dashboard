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

interface BatchMonitorWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

const BatchMonitorWidget: React.FC<BatchMonitorWidgetProps> = ({ config = {}, onError }) => {
  const machineId = (config.machineId as number) ?? 0;
  const {
    data: activeBatch,
    isLoading: batchLoading,
    error: batchError,
  } = useActiveBatch(machineId || undefined);
  const { data: seriesData, isLoading: dataLoading } = useBatchData(activeBatch?.id ?? 0);

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
        <Typography variant="body2" color="text.secondary">
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
        <Typography variant="body2" color="text.secondary">
          No active batch on this machine.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5, width: '100%', height: '100%', overflow: 'auto' }}>
      {/* Header info */}
      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>
            {activeBatch.batchNumber}
          </Typography>
          <Chip label={activeBatch.status} size="small" color="warning" />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Recipe: {activeBatch.recipeName ?? '-'} (v{activeBatch.recipeVersion ?? '?'})
        </Typography>
        <Typography variant="caption" color="text.secondary">
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
                const values = series.dataPoints.map((dp) => dp.value);
                const current = values.length > 0 ? values[values.length - 1] : null;
                const inRange =
                  series.setpoint != null && current != null
                    ? Math.abs(current - series.setpoint) <= series.setpoint * 0.1
                    : true;
                return (
                  <TableRow key={series.nodeKey}>
                    <TableCell sx={{ py: 0.3, fontSize: '0.75rem' }}>
                      {series.displayName}
                    </TableCell>
                    <TableCell sx={{ py: 0.3, fontSize: '0.75rem' }} align="right">
                      {series.setpoint != null ? series.setpoint : '-'}
                    </TableCell>
                    <TableCell
                      sx={{
                        py: 0.3,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: inRange ? 'success.main' : 'error.main',
                      }}
                      align="right"
                    >
                      {current != null ? current.toFixed(2) : '-'}
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
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center' }}
        >
          No parameter data available.
        </Typography>
      )}
    </Box>
  );
};

export default BatchMonitorWidget;
