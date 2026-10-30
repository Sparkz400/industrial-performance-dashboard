import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';

interface AlertHistoryItem {
  id: number;
  ruleId: number;
  ruleName: string;
  severity: string;
  nodeKey: string;
  triggerValue: number;
  threshold: number;
  status: string;
  createdAt: string;
  metadata?: { conditionState?: string };
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

interface AlertHistoryResponse {
  data: AlertHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low', 'info'];
const STATUSES = ['all', 'active', 'acknowledged', 'resolved'];

const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' | 'default' => {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'info';
    default:
      return 'default';
  }
};

const getStatusColor = (status: string): 'error' | 'warning' | 'success' | 'default' => {
  switch (status) {
    case 'active':
      return 'error';
    case 'acknowledged':
      return 'warning';
    case 'resolved':
      return 'success';
    default:
      return 'default';
  }
};

const formatDate = (isoDate: string | null | undefined): string => {
  if (!isoDate) return '-';
  return new Date(isoDate).toLocaleString();
};

const AlertHistoryPage: React.FC = () => {
  const t = useT();

  const canAcknowledge = useAuthStore(
    (s) =>
      ['admin', 'operator', 'supervisor'].includes(s.user?.role ?? '') && !s.user?.recoveryMode,
  );
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set('offset', String(page * rowsPerPage));
    params.set('limit', String(rowsPerPage));
    if (severityFilter !== 'all') params.set('severity', severityFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('startDate', new Date(dateFrom).toISOString());
    if (dateTo) params.set('endDate', new Date(dateTo).toISOString());
    return `${API_ENDPOINTS.alerts.history}?${params.toString()}`;
  }, [page, rowsPerPage, severityFilter, statusFilter, dateFrom, dateTo]);

  const { data, isLoading, error, refetch } = useQuery<AlertHistoryResponse>({
    queryKey: ['alertHistory', page, rowsPerPage, severityFilter, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await protectedFetch(buildUrl());
      if (!res.ok) throw new Error('Failed to fetch alert history');
      return res.json();
    },
    refetchInterval: 5000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await protectedFetch(API_ENDPOINTS.alerts.acknowledge(id), {
        method: 'PUT',
      });
      if (!res.ok) throw new Error('Failed to acknowledge alert');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertHistory'] });
    },
  });

  const items = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minWidth: 0, width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 'bold',
            }}
          >
            {t('Alert History')}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            {t(
              'Acknowledge incidents here. Only good measurements can confirm recovery; unknown quality never clears an alarm.',
            )}
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isLoading}>
          {t('Refresh')}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      {/* Filter bar */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>{t('Severity')}</InputLabel>
          <Select
            value={severityFilter}
            label={t('Severity')}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(0);
            }}
          >
            {SEVERITIES.map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                {s === 'all' ? 'All Severities' : s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>{t('Status')}</InputLabel>
          <Select
            value={statusFilter}
            label={t('Status')}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
          >
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                {s === 'all' ? 'All Statuses' : s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label={t('From')}
          type="date"
          size="small"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(0);
          }}
          slotProps={{
            inputLabel: { shrink: true },
          }}
        />
        <TextField
          label={t('To')}
          type="date"
          size="small"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(0);
          }}
          slotProps={{
            inputLabel: { shrink: true },
          }}
        />
      </Paper>

      {isLoading ? (
        <PageSkeleton variant="cards" count={3} />
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('Timestamp')}</TableCell>
                  <TableCell>{t('Rule')}</TableCell>
                  <TableCell>{t('Severity')}</TableCell>
                  <TableCell>{t('Node Key')}</TableCell>
                  <TableCell>{t('Trigger Value')}</TableCell>
                  <TableCell>{t('Threshold')}</TableCell>
                  <TableCell>{t('Status')}</TableCell>
                  <TableCell>{t('Actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        {t('No alert history found')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDate(item.createdAt)}</TableCell>
                      <TableCell>{item.ruleName}</TableCell>
                      <TableCell>
                        <Chip
                          label={item.severity}
                          color={getSeverityColor(item.severity)}
                          size="small"
                          sx={{ textTransform: 'capitalize' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                          }}
                        >
                          {item.nodeKey}
                        </Typography>
                      </TableCell>
                      <TableCell>{item.triggerValue}</TableCell>
                      <TableCell>{item.threshold}</TableCell>
                      <TableCell>
                        <Chip
                          label={
                            item.metadata?.conditionState === 'unknown'
                              ? `${item.status} · input unknown`
                              : item.status
                          }
                          color={getStatusColor(item.status)}
                          size="small"
                          sx={{ textTransform: 'capitalize' }}
                        />
                      </TableCell>
                      <TableCell>
                        {canAcknowledge && item.status === 'active' && (
                          <IconButton
                            size="small"
                            title={t('Acknowledge')}
                            onClick={() => acknowledgeMutation.mutate(item.id)}
                            disabled={acknowledgeMutation.isPending}
                          >
                            <CheckCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </>
      )}
    </Box>
  );
};

export default AlertHistoryPage;
