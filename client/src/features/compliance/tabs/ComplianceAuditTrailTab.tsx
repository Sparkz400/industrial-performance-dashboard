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
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  useComplianceLogs,
  useIntegrityCheck,
  type ComplianceLogFilters,
  type ComplianceLogEntry,
} from '../hooks/useComplianceQueries';
import AuditDetailDrawer from '../components/AuditDetailDrawer';
import { API_ENDPOINTS } from '@/config/config';

const ACTION_OPTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'EXPORT'];
const ENTITY_TYPE_OPTIONS = [
  '',
  'dashboard',
  'machine',
  'recipe',
  'batch',
  'spc_profile',
  'user',
  'compliance_config',
];
const PAGE_SIZE = 25;

const ComplianceAuditTrailTab: React.FC = () => {
  const [filters, setFilters] = useState<ComplianceLogFilters>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<ComplianceLogEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const handleRowClick = (entry: ComplianceLogEntry) => {
    setSelectedEntry(entry);
    setDrawerOpen(true);
  };

  const getActionColor = (
    action: string,
  ): 'default' | 'primary' | 'error' | 'warning' | 'success' => {
    if (action.includes('create') || action.includes('CREATE')) return 'success';
    if (action.includes('update') || action.includes('UPDATE') || action.includes('saved'))
      return 'primary';
    if (action.includes('delete') || action.includes('DELETE')) return 'error';
    if (action.includes('restore') || action.includes('RESTORE')) return 'warning';
    return 'default';
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Compliance Audit Trail</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={integrityLoading ? <CircularProgress size={18} /> : <VerifiedUserIcon />}
            onClick={() => runIntegrityCheck()}
            disabled={integrityLoading}
            size="small"
          >
            Integrity Check
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportCsv}
            size="small"
          >
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
            ? `Integrity check passed. ${integrityData.checkedRecords ?? integrityData.totalRecords} records verified — SHA-256 chain intact.`
            : `Integrity check FAILED. Chain broken at record #${integrityData.firstBrokenId}. ${integrityData.checkedRecords ?? integrityData.totalRecords} records checked.`}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
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
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Entity</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Signed</TableCell>
              <TableCell width={48} />
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
                <TableRow
                  key={entry.id}
                  hover
                  onClick={() => handleRowClick(entry)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(entry.createdAt).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={entry.action}
                      color={getActionColor(entry.action)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{entry.entityName || entry.entityType}</Typography>
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                      {entry.entityType}
                      {entry.entityId ? ` #${entry.entityId}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell>{entry.username || '-'}</TableCell>
                  <TableCell>
                    <Tooltip title={entry.reasonForChange || entry.reason || ''}>
                      <Typography
                        variant="body2"
                        sx={{
                          maxWidth: 180,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.reasonForChange || entry.reason || (
                          <Typography component="span" variant="body2" color="warning.main">
                            Missing
                          </Typography>
                        )}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {entry.electronicSignature || entry.signature ? (
                      <Tooltip title="Electronically signed">
                        <VerifiedUserIcon fontSize="small" color="success" />
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View details">
                      <IconButton size="small">
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
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

      {/* Detail Drawer */}
      <AuditDetailDrawer
        entry={selectedEntry}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </Box>
  );
};

export default ComplianceAuditTrailTab;
