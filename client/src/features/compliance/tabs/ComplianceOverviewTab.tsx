import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  CardHeader,
  Alert,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import GavelIcon from '@mui/icons-material/Gavel';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useComplianceStats, useIntegrityCheck } from '../hooks/useComplianceQueries';
import { format } from 'date-fns';

const getCoverageColor = (value: number): 'success' | 'warning' | 'error' => {
  if (value >= 90) return 'success';
  if (value >= 70) return 'warning';
  return 'error';
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

const ComplianceOverviewTab: React.FC = () => {
  const { data: stats, isLoading, error } = useComplianceStats();
  const { data: integrityData } = useIntegrityCheck();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load compliance statistics: {(error as Error).message}
      </Alert>
    );
  }

  if (!stats) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        No compliance statistics available.
      </Alert>
    );
  }

  const signatureCoverageColor = getCoverageColor(stats.signatureCoverage);
  const reasonCoverageColor = getCoverageColor(stats.reasonCoverage);

  return (
    <Box>
      {/* Top row: 4 KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={<GavelIcon color="primary" />}
              title="Compliance Mode"
              titleTypographyProps={{ variant: 'subtitle2', color: 'text.secondary' }}
            />
            <CardContent sx={{ pt: 0 }}>
              <Chip
                icon={stats.complianceModeEnabled ? <CheckCircleIcon /> : <ErrorIcon />}
                label={stats.complianceModeEnabled ? 'Enabled' : 'Disabled'}
                color={stats.complianceModeEnabled ? 'success' : 'default'}
                variant="outlined"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={<TrendingUpIcon color="primary" />}
              title="Events (30d)"
              titleTypographyProps={{ variant: 'subtitle2', color: 'text.secondary' }}
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4">{stats.eventsLast30Days}</Typography>
              <Typography variant="body2" color="text.secondary">
                {stats.eventsLast7Days} in the last 7 days
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={<VerifiedUserIcon color={signatureCoverageColor} />}
              title="Signature Coverage"
              titleTypographyProps={{ variant: 'subtitle2', color: 'text.secondary' }}
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4">{stats.signatureCoverage}%</Typography>
              <LinearProgress
                variant="determinate"
                value={stats.signatureCoverage}
                color={signatureCoverageColor}
                sx={{ mt: 1, height: 8, borderRadius: 4 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={<HistoryEduIcon color={reasonCoverageColor} />}
              title="Reason Coverage"
              titleTypographyProps={{ variant: 'subtitle2', color: 'text.secondary' }}
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4">{stats.reasonCoverage}%</Typography>
              <LinearProgress
                variant="determinate"
                value={stats.reasonCoverage}
                color={reasonCoverageColor}
                sx={{ mt: 1, height: 8, borderRadius: 4 }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Second row: Unsigned Actions & Missing Reasons */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={
                <WarningAmberIcon
                  color={stats.unsignedEventsLast30Days > 0 ? 'warning' : 'success'}
                />
              }
              title="Unsigned Actions (30d)"
              titleTypographyProps={{ variant: 'subtitle2', color: 'text.secondary' }}
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4">{stats.unsignedEventsLast30Days}</Typography>
              {stats.unsignedEventsLast30Days > 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {stats.unsignedEventsLast30Days} event
                  {stats.unsignedEventsLast30Days !== 1 ? 's' : ''} without electronic signature in
                  the last 30 days.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={
                <WarningAmberIcon
                  color={stats.eventsWithoutReasonLast30Days > 0 ? 'warning' : 'success'}
                />
              }
              title="Missing Reasons (30d)"
              titleTypographyProps={{ variant: 'subtitle2', color: 'text.secondary' }}
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4">{stats.eventsWithoutReasonLast30Days}</Typography>
              {stats.eventsWithoutReasonLast30Days > 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {stats.eventsWithoutReasonLast30Days} event
                  {stats.eventsWithoutReasonLast30Days !== 1 ? 's' : ''} without a reason for change
                  in the last 30 days.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Third row: Events by Action & Events by Entity Type */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Events by Action" />
            <CardContent>
              {stats.byAction.length > 0 ? (
                <Stack spacing={1}>
                  {stats.byAction.map((entry) => (
                    <Stack
                      key={entry.action}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                      <Chip
                        label={entry.action}
                        color={getActionColor(entry.action)}
                        size="small"
                        variant="outlined"
                      />
                      <Typography variant="body2" fontWeight="bold">
                        {entry.count}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No events recorded.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Events by Entity Type" />
            <CardContent>
              {stats.byEntityType.length > 0 ? (
                <Stack spacing={1}>
                  {stats.byEntityType.map((entry) => (
                    <Stack
                      key={entry.entityType}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                      <Typography variant="body2">{entry.entityType}</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {entry.count}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No events recorded.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Fourth row: Recent Events */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardHeader title="Recent Events" />
            <CardContent>
              {stats.recentEvents.length > 0 ? (
                <Stack spacing={1}>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                      py: 1,
                      px: 1,
                      borderBottom: '2px solid',
                      borderColor: 'divider',
                      bgcolor: 'grey.50',
                      borderRadius: '4px 4px 0 0',
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ flex: 2 }}>
                      Timestamp
                    </Typography>
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>
                      Action
                    </Typography>
                    <Typography variant="subtitle2" sx={{ flex: 2 }}>
                      Entity
                    </Typography>
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>
                      User
                    </Typography>
                  </Stack>
                  {stats.recentEvents.map((event) => (
                    <Stack
                      key={event.id}
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      sx={{
                        py: 1,
                        px: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Typography variant="body2" sx={{ flex: 2 }}>
                        {format(new Date(event.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                      </Typography>
                      <Box sx={{ flex: 1 }}>
                        <Chip
                          label={event.action}
                          color={getActionColor(event.action)}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                      <Typography variant="body2" sx={{ flex: 2 }}>
                        {event.entityType}
                        {event.entityName ? ` - ${event.entityName}` : ` (${event.entityId})`}
                      </Typography>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {event.username}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No recent events.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ComplianceOverviewTab;
