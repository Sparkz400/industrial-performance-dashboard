import React, { memo } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  Button,
  Divider,
} from '@mui/material';
import WidgetSkeleton from '@/shared/components/loading/WidgetSkeleton';

interface AlertSummaryItem {
  id: number;
  ruleName: string;
  severity: string;
  nodeKey: string;
  triggeredAt?: string;
  createdAt?: string;
  status: string;
}

interface SeverityCount {
  severity: string;
  count: number;
}

interface AlertSummaryWidgetViewProps {
  recentAlerts: AlertSummaryItem[];
  severityCounts: SeverityCount[];
  loading: boolean;
  error: string | null;
  onViewAll: () => void;
}

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

const formatDate = (isoDate?: string): string =>
  isoDate && Number.isFinite(Date.parse(isoDate))
    ? new Date(isoDate).toLocaleString()
    : 'Unknown event time';

const AlertSummaryWidgetView = memo(function AlertSummaryWidgetView({
  recentAlerts,
  severityCounts,
  loading,
  error,
  onViewAll,
}: AlertSummaryWidgetViewProps) {
  if (loading) {
    return <WidgetSkeleton variant="table" />;
  }

  if (error) {
    return (
      <Box sx={{ width: '100%', height: '100%', p: 2 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  const totalActive = severityCounts.reduce((sum, s) => sum + s.count, 0);

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Alert Summary
      </Typography>

      {/* Severity counts */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label={`Latest active alerts shown: ${totalActive} (maximum 5)`}
          size="small"
          variant="outlined"
        />
        {severityCounts.map((sc) => (
          <Chip
            key={sc.severity}
            label={`${sc.severity}: ${sc.count}`}
            color={getSeverityColor(sc.severity)}
            size="small"
            sx={{ textTransform: 'capitalize' }}
          />
        ))}
      </Box>

      <Divider />

      {/* Recent alerts */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {recentAlerts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              No active alerts
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {recentAlerts.map((alert) => (
              <ListItem key={alert.id} divider sx={{ px: 0 }}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={alert.severity}
                        color={getSeverityColor(alert.severity)}
                        size="small"
                        sx={{ textTransform: 'capitalize' }}
                      />
                      <Typography variant="body2" noWrap>
                        {alert.ruleName}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {alert.nodeKey} - {formatDate(alert.createdAt ?? alert.triggeredAt)}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Box sx={{ pt: 1, textAlign: 'center' }}>
        <Button size="small" onClick={onViewAll}>
          View All
        </Button>
      </Box>
    </Box>
  );
});

AlertSummaryWidgetView.displayName = 'AlertSummaryWidgetView';

export default AlertSummaryWidgetView;
