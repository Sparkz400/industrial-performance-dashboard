import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  MenuItem,
  Button,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import {
  useComplianceLogs,
  useIntegrityCheck,
  type ComplianceLogFilters,
  type ComplianceLogEntry,
} from '../hooks/useComplianceQueries';
import { API_ENDPOINTS } from '@/config/config';

const ACTION_OPTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'EXPORT'];
const ENTITY_TYPE_OPTIONS = ['', 'dashboard', 'machine', 'recipe', 'batch', 'spc_profile', 'user'];
const PAGE_SIZE = 25;

const ComplianceAuditPage: React.FC = () => {
  const [filters, setFilters] = useState<ComplianceLogFilters>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useComplianceLogs(filters);
  const {
    data: integrityData,
    isLoading: integrityLoading,
    refetch: runIntegrityCheck,
    isFetched: integrityFetched,
  } = useIntegrityCheck();

  const handleFilterChange = useCallback((key: keyof ComplianceLogFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, offset: 0 }));
    setPage(0);
  }, []);

  const handlePageChange = (_event: unknown, newPage: number) => {
    setPage(newPage);
    setFilters((prev) => ({ ...prev, offset: newPage * PAGE_SIZE }));
  };

  const handleExportCsv = () => {
    window.open(API_ENDPOINTS.compliance.export + '?format=csv', '_blank');
  };

  const getActionColor = (
    action: string,
  ): 'default' | 'primary' | 'error' | 'warning' | 'success' => {
    switch (action) {
      case 'CREATE':
        return 'success';
      case 'UPDATE':
        return 'primary';
      case 'DELETE':
        return 'error';
      case 'RESTORE':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Compliance Audit Trail</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={integrityLoading ? <CircularProgress size={18} /> : <VerifiedUserIcon />}
            onClick={() => runIntegrityCheck()}
            disabled={integrityLoading}
          >
            Integrity Check
          </Button>
          <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleExportCsv}>
            Export CSV
          </Button>
        </Stack>
      </Stack>

      {/* Integrity check result */}
      {integrityFetched && integrityData && (
        <Alert
          severity={integrityData.valid ? 'success' : 'error'}
          icon={integrityData.valid ? <CheckCircleIcon /> : <ErrorIcon />}
          sx={{ mb: 2 }}
          onClose={() => {}}
        >
          {integrityData.valid
            ? `Integrity check passed. ${integrityData.totalRecords} records verified.`
            : `Integrity check failed. ${integrityData.invalidRecords} of ${integrityData.totalRecords} records are invalid.`}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <TextField
            select
            label="Action"
            value={filters.action || ''}
            onChange={(e) => handleFilterChange('action', e.target.value)}
            size="small"
            sx={{ minWidth: 140 }}
          >
            {ACTION_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt || 'All Actions'}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Entity Type"
            value={filters.entityType || ''}
            onChange={(e) => handleFilterChange('entityType', e.target.value)}
            size="small"
            sx={{ minWidth: 160 }}
          >
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt || 'All Types'}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="From"
            type="date"
            value={filters.dateFrom || ''}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="To"
            type="date"
            value={filters.dateTo || ''}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Search"
            value={filters.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            size="small"
            slotProps={{
              input: {
                endAdornment: <SearchIcon color="action" />,
              },
            }}
          />
        </Stack>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load compliance logs: {(error as Error).message}
        </Alert>
      )}

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Entity Type</TableCell>
              <TableCell>Entity ID</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Signed</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : data?.logs && data.logs.length > 0 ? (
              data.logs.map((entry: ComplianceLogEntry) => (
                <TableRow key={entry.id} hover>
                  <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Chip
                      label={entry.action}
                      color={getActionColor(entry.action)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{entry.entityType}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                      {entry.entityId}
                    </Typography>
                  </TableCell>
                  <TableCell>{entry.username}</TableCell>
                  <TableCell>
                    <Tooltip title={entry.reason || ''}>
                      <Typography
                        variant="body2"
                        sx={{
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.reason || '-'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {entry.signature ? (
                      <Tooltip title="Electronically signed">
                        <IconButton size="small" color="success">
                          <VerifiedUserIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No compliance logs found.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={data?.total ?? 0}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </TableContainer>
    </Box>
  );
};

export default ComplianceAuditPage;
