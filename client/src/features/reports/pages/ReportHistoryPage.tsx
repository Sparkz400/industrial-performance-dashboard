import ResponsiveTable from '@/shared/components/ResponsiveTable';
import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
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
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';

interface ReportHistoryItem {
  id: number;
  scheduleId: number;
  scheduleName: string;
  generatedAt: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  fileSize: number | null;
  error: string | null;
  attempts: number;
  retryAt: string | null;
  scheduledFor: string | null;
  emailStatus: string;
  emailAttempts: number;
  emailRetryAt: string | null;
  emailError: string | null;
}

interface ReportHistoryResponse {
  data: ReportHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

interface ReportScheduleOption {
  id: number;
  name: string;
}

const getStatusColor = (status: string): 'warning' | 'success' | 'error' | 'default' => {
  switch (status) {
    case 'generating':
      return 'warning';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
};

const formatDate = (isoDate: string): string => new Date(isoDate).toLocaleString();

const formatFileSize = (bytes: number | null): string => {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fetchScheduleOptions = async (): Promise<ReportScheduleOption[]> => {
  const res = await protectedFetch(API_ENDPOINTS.reports.schedules);
  if (!res.ok) throw new Error('Failed to fetch schedules');
  return res.json();
};

const ReportHistoryPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [scheduleFilter, setScheduleFilter] = useState<number | 'all'>('all');
  const [retryError, setRetryError] = useState('');

  const { data: scheduleOptions = [] } = useQuery({
    queryKey: ['reportScheduleOptions'],
    queryFn: fetchScheduleOptions,
  });

  const { data, isLoading, error, refetch } = useQuery<ReportHistoryResponse>({
    queryKey: ['reportHistory', page, rowsPerPage, scheduleFilter],
    refetchInterval: 2000,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('offset', String(page * rowsPerPage));
      params.set('limit', String(rowsPerPage));
      if (scheduleFilter !== 'all') params.set('scheduleId', String(scheduleFilter));
      const res = await protectedFetch(`${API_ENDPOINTS.reports.history}?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch report history');
      return res.json();
    },
  });

  const handleDownload = (id: number) => {
    const url = API_ENDPOINTS.reports.download(id);
    window.open(url, '_blank');
  };

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
            Report History
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            View generated reports and download completed ones
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isLoading}>
          Refresh
        </Button>
      </Box>

      {(error || retryError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {retryError || (error as Error).message}
        </Alert>
      )}

      {/* Filter bar */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Schedule</InputLabel>
          <Select
            value={scheduleFilter}
            label="Schedule"
            onChange={(e) => {
              setScheduleFilter(e.target.value as number | 'all');
              setPage(0);
            }}
          >
            <MenuItem value="all">All Schedules</MenuItem>
            {scheduleOptions.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      {isLoading ? (
        <PageSkeleton variant="cards" count={3} />
      ) : (
        <>
          <TableContainer component={Paper}>
            <ResponsiveTable
              labels={[
                'Schedule',
                'Created At',
                'Status',
                'Email delivery',
                'File Size',
                'Actions',
              ]}
              size="small"
            >
              <TableHead>
                <TableRow>
                  <TableCell>Schedule</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Email delivery</TableCell>
                  <TableCell>File Size</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        No report history found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.scheduleName}</TableCell>
                      <TableCell>{formatDate(item.generatedAt)}</TableCell>
                      <TableCell>
                        <Chip
                          label={item.status}
                          color={getStatusColor(item.status)}
                          size="small"
                          sx={{ textTransform: 'capitalize' }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                          }}
                        >
                          Attempts: {item.attempts}
                          {item.scheduledFor
                            ? ` · Period ends ${formatDate(item.scheduledFor)}`
                            : ''}
                        </Typography>
                        {item.error && (
                          <Typography variant="body2" color="error">
                            {item.error}
                          </Typography>
                        )}
                        {item.retryAt && (
                          <Typography variant="caption">
                            Retry: {formatDate(item.retryAt)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography>{item.emailStatus}</Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                          }}
                        >
                          Attempts: {item.emailAttempts}
                        </Typography>
                        {item.emailError && (
                          <Typography variant="body2" color="error">
                            {item.emailError}
                          </Typography>
                        )}
                        {item.emailRetryAt && (
                          <Typography variant="caption">
                            Retry: {formatDate(item.emailRetryAt)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{formatFileSize(item.fileSize)}</TableCell>
                      <TableCell>
                        {(item.status === 'failed' ||
                          ['failed', 'blocked', 'retrying'].includes(item.emailStatus)) && (
                          <Button
                            onClick={async () => {
                              setRetryError('');
                              try {
                                const response = await protectedFetch(
                                  `${API_ENDPOINTS.reports.history}/${item.id}/retry`,
                                  { method: 'POST' },
                                );
                                if (!response.ok) {
                                  const data = await response.json();
                                  throw new Error(data.message ?? 'Retry failed');
                                }
                                await refetch();
                              } catch (failure) {
                                setRetryError(String(failure));
                              }
                            }}
                          >
                            Retry #{item.id}
                          </Button>
                        )}
                        {item.status === 'completed' && (
                          <IconButton
                            size="small"
                            title="Download"
                            onClick={() => handleDownload(item.id)}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </ResponsiveTable>
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

export default ReportHistoryPage;
