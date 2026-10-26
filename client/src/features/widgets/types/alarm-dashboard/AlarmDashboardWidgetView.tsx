import React, { useState, useCallback, memo } from 'react';
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
} from '@mui/material';
import WidgetSkeleton from '@/shared/components/loading/WidgetSkeleton';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { SEVERITY_LEVELS, ALARM_STATUS } from './useAlarmData';
import type { Alarm, SeverityLevel, AlarmStatus } from './useAlarmData';

// Format ISO date to readable format
const formatDate = (isoDate: string | undefined): string => {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  return date.toLocaleString();
};

// Get appropriate severity color
const getSeverityColor = (severity: SeverityLevel): 'error' | 'warning' | 'info' => {
  switch (severity) {
    case SEVERITY_LEVELS.CRITICAL:
    case SEVERITY_LEVELS.HIGH:
      return 'error';
    case SEVERITY_LEVELS.MEDIUM:
    case SEVERITY_LEVELS.LOW:
      return 'warning';
    default:
      return 'info';
  }
};

// Get appropriate status color
const getStatusColor = (status: AlarmStatus): 'error' | 'warning' | 'success' | 'default' => {
  switch (status) {
    case ALARM_STATUS.ACTIVE:
      return 'error';
    case ALARM_STATUS.ACKNOWLEDGED:
      return 'warning';
    case ALARM_STATUS.CLEARED:
      return 'success';
    default:
      return 'default';
  }
};

interface AlarmDashboardWidgetViewProps {
  alarms: Alarm[];
  loading: boolean;
  error: string | null;
  onAcknowledge: (id: number) => void;
}

const AlarmDashboardWidgetView = memo(function AlarmDashboardWidgetView({
  alarms,
  loading,
  error,
  onAcknowledge,
}: AlarmDashboardWidgetViewProps) {
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(5);

  const handleChangePage = useCallback((_event: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  // Display loading state with skeleton
  if (loading) {
    return <WidgetSkeleton variant="table" />;
  }

  // Display error state
  if (error) {
    return (
      <Box sx={{ width: '100%', height: '100%', p: 2 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Alarm Dashboard
      </Typography>

      <TableContainer component={Paper} sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {alarms.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((alarm) => (
              <TableRow key={alarm.id}>
                <TableCell>{formatDate(alarm.createdAt ?? undefined)}</TableCell>
                <TableCell>
                  <Chip
                    label={alarm.severity ?? 'unknown'}
                    color={getSeverityColor((alarm.severity ?? 'info') as SeverityLevel)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={
                      alarm.metadata?.conditionState === 'unknown'
                        ? `${alarm.status} · input unknown`
                        : (alarm.status ?? 'unknown')
                    }
                    color={getStatusColor((alarm.status ?? 'active') as AlarmStatus)}
                    size="small"
                  />
                </TableCell>
                <TableCell>{alarm.ruleName ?? alarm.nodeKey ?? '-'}</TableCell>
                <TableCell>{alarm.message}</TableCell>
                <TableCell>
                  {alarm.status === ALARM_STATUS.ACTIVE && (
                    <IconButton
                      size="small"
                      onClick={() => onAcknowledge(alarm.id)}
                      aria-label={`Acknowledge alarm: ${alarm.message}`}
                    >
                      <CheckCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={alarms.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Box>
  );
});

AlarmDashboardWidgetView.displayName = 'AlarmDashboardWidgetView';

export default AlarmDashboardWidgetView;
