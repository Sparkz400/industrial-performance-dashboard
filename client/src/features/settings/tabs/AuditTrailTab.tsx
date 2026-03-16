import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PreviewIcon from '@mui/icons-material/Preview';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import { format, formatDistanceToNow } from 'date-fns';

import VirtualizedTable, { type VirtualizedColumn } from '@/shared/components/VirtualizedTable';
import type { AuditLogEntry, GetAuditLogsRequest } from '@/types';
import { useAuditLogs } from '../hooks/useAuditLogs';

const ENTITY_OPTIONS = [
  { label: 'All entities', value: '' },
  { label: 'Auth', value: 'auth' },
  { label: 'Users', value: 'user' },
  { label: 'Dashboards', value: 'dashboard' },
  { label: 'Machines', value: 'machine' },
];

const ACTION_OPTIONS = [
  { label: 'All actions', value: '' },
  { label: 'Logins', value: 'auth.login' },
  { label: 'Logouts', value: 'auth.logout' },
  { label: 'Password changes', value: 'auth.password_changed' },
  { label: 'User created', value: 'user.created' },
  { label: 'User updated', value: 'user.updated' },
  { label: 'Dashboard saved', value: 'dashboard.saved' },
  { label: 'Dashboard deleted', value: 'dashboard.deleted' },
  { label: 'Dashboard imported', value: 'dashboard.imported' },
  { label: 'Machine created', value: 'machine.created' },
  { label: 'Machine updated', value: 'machine.updated' },
  { label: 'Machine deleted', value: 'machine.deleted' },
  { label: 'Machine connect requested', value: 'machine.connect_requested' },
  { label: 'Machine disconnect requested', value: 'machine.disconnect_requested' },
  { label: 'Mappings saved', value: 'machine.mappings_saved' },
  { label: 'Mapping deleted', value: 'machine.mapping_deleted' },
];

const LIMIT_OPTIONS = [50, 100, 250, 500];

/**
 *
 * @param rows
 */
function downloadCsv(rows: AuditLogEntry[]) {
  const headers = ['Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Entity ID', 'Message', 'IP'];
  const lines = rows.map((row) =>
    [
      row.createdAt,
      row.username || 'System',
      row.userRole || '',
      row.action,
      row.entityType,
      row.entityId || '',
      row.message,
      row.ipAddress || '',
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(','),
  );

  const blob = new Blob([[headers.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const AuditTrailTab: React.FC = () => {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);

  const deferredSearch = useDeferredValue(search);

  const filters = useMemo<GetAuditLogsRequest>(
    () => ({
      search: deferredSearch.trim() || undefined,
      entityType: entityType || undefined,
      action: action || undefined,
      limit,
    }),
    [action, deferredSearch, entityType, limit],
  );

  const { data = [], error, isLoading, isFetching, refetch } = useAuditLogs(filters);

  const uniqueActors = useMemo(
    () => new Set(data.map((entry) => entry.username).filter(Boolean)).size,
    [data],
  );

  const uniqueEntities = useMemo(
    () =>
      new Set(
        data.map((entry) => `${entry.entityType}:${entry.entityId || entry.entityName || ''}`),
      ).size,
    [data],
  );

  const columns = useMemo<VirtualizedColumn<AuditLogEntry>[]>(
    () => [
      {
        key: 'createdAt',
        header: 'When',
        width: 190,
        render: (row) => (
          <Box>
            <Typography variant="body2">{format(new Date(row.createdAt), 'PPp')}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
            </Typography>
          </Box>
        ),
      },
      {
        key: 'actor',
        header: 'Actor',
        width: 150,
        render: (row) => (
          <Box>
            <Typography variant="body2">{row.username || 'System'}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.userRole || 'n/a'}
            </Typography>
          </Box>
        ),
      },
      {
        key: 'action',
        header: 'Action',
        width: 180,
        render: (row) => (
          <Chip
            label={row.action}
            size="small"
            color={row.action.startsWith('auth.') ? 'secondary' : 'primary'}
            variant="outlined"
          />
        ),
      },
      {
        key: 'entity',
        header: 'Entity',
        width: 160,
        render: (row) => (
          <Box>
            <Typography variant="body2">{row.entityName || row.entityType}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.entityType}
              {row.entityId ? ` #${row.entityId}` : ''}
            </Typography>
          </Box>
        ),
      },
      {
        key: 'message',
        header: 'Details',
        render: (row) => (
          <Box sx={{ py: 1 }}>
            <Typography variant="body2">{row.message}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.ipAddress || 'IP unavailable'}
            </Typography>
          </Box>
        ),
      },
    ],
    [],
  );

  return (
    <Stack spacing={2.5}>
      <Alert severity="info">
        Audit Trail records who changed dashboards, machine configuration, and user access so teams
        can support compliance reviews and root-cause investigations.
      </Alert>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined">
            <CardHeader avatar={<HistoryEduIcon color="primary" />} title="Events loaded" />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4">{data.length}</Typography>
              <Typography variant="body2" color="text.secondary">
                Most recent audit events in the selected window
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined">
            <CardHeader avatar={<PersonOutlineIcon color="secondary" />} title="Actors" />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4">{uniqueActors}</Typography>
              <Typography variant="body2" color="text.secondary">
                Distinct users represented in this result set
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined">
            <CardHeader avatar={<CategoryOutlinedIcon color="action" />} title="Entities" />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4">{uniqueEntities}</Typography>
              <Typography variant="body2" color="text.secondary">
                Dashboards, users, auth sessions, and machines touched
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardHeader
          title="Filter audit events"
          subheader="Search by actor, entity, or event details"
          action={
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => refetch()}
                disabled={isFetching}
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={() => downloadCsv(data)}
                disabled={data.length === 0}
              >
                Export CSV
              </Button>
            </Stack>
          }
        />
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                fullWidth
                size="small"
                label="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search message, entity, or username"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Entity type"
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
              >
                {ENTITY_OPTIONS.map((option) => (
                  <MenuItem key={option.label} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Action"
                value={action}
                onChange={(event) => setAction(event.target.value)}
              >
                {ACTION_OPTIONS.map((option) => (
                  <MenuItem key={option.label} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Rows"
                value={String(limit)}
                onChange={(event) => setLimit(Number(event.target.value))}
              >
                {LIMIT_OPTIONS.map((option) => (
                  <MenuItem key={option} value={String(option)}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardHeader
          title="Recent activity"
          subheader={isLoading ? 'Loading audit events...' : `${data.length} events loaded`}
          avatar={<PreviewIcon color="primary" />}
        />
        <CardContent>
          {error instanceof Error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error.message}
            </Alert>
          )}

          <VirtualizedTable
            rows={data}
            columns={columns}
            rowHeight={76}
            maxHeight={560}
            getRowKey={(row) => row.id}
            emptyMessage="No audit events matched the current filters."
          />
        </CardContent>
      </Card>
    </Stack>
  );
};

export default AuditTrailTab;
