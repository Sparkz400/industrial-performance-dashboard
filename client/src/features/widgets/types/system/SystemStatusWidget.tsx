import React, { memo, useCallback, useMemo } from 'react';
import {
  Typography,
  Box,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import StatusIndicator from './components/StatusIndicator';
import { useStatusStore } from '@/stores/useStatusStore';
import type { WidgetConfig, ServiceStatus } from '@/types';

interface SystemStatusWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

/**
 * SystemStatusWidget displays the current status of system components
 * using the Zustand status store
 */
const SystemStatusWidget = memo<SystemStatusWidgetProps>(({ config = {} }) => {
  const { showDetails = true } = config;

  const status = useStatusStore((s) => s.status);
  const isError = useStatusStore((s) => s.isError);
  const isConnected = useStatusStore((s) => s.isConnected);
  const lastChecked = useStatusStore((s) => s.lastChecked);
  const refreshStatus = useStatusStore((s) => s.refreshStatus);

  const overallStatus = status?.overall?.status?.toLowerCase() || 'unknown';
  const loading = false; // Store handles async internally
  const hasError = isError;
  const lastUpdated = lastChecked;

  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    Promise.resolve(refreshStatus())
      .catch((err: Error) => {
        console.error('Manual refresh error:', err);
      })
      .finally(() => {
        setTimeout(() => setIsRefreshing(false), 2000);
      });
  }, [refreshStatus, isRefreshing]);

  // Format the last updated time
  const formattedLastUpdated = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never';

  // Format status text for display
  const formatStatusText = useCallback(
    (statusValue: ServiceStatus | string | undefined): string => {
      if (!statusValue) return 'Unknown';
      if (typeof statusValue === 'object' && statusValue.statusText) return statusValue.statusText;
      if (typeof statusValue === 'object' && statusValue.status) {
        const statusStr = String(statusValue.status);
        return statusStr.charAt(0).toUpperCase() + statusStr.slice(1).toLowerCase();
      }
      if (typeof statusValue === 'string') {
        return statusValue.charAt(0).toUpperCase() + statusValue.slice(1).toLowerCase();
      }
      return 'Unknown';
    },
    [],
  );

  // Get appropriate icon color based on status
  const getIconColor = useCallback(
    (statusValue: ServiceStatus | string | undefined): 'success' | 'error' => {
      if (!statusValue) return 'error';
      const s =
        typeof statusValue === 'object'
          ? statusValue.status?.toLowerCase()
          : statusValue.toLowerCase();
      return s === 'ok' || s === 'connected' ? 'success' : 'error';
    },
    [],
  );

  // Memoize derived status text
  const dbStatusText = useMemo(
    () => formatStatusText(status?.database),
    [formatStatusText, status?.database],
  );
  const opcuaStatusText = useMemo(
    () => formatStatusText(status?.opcua),
    [formatStatusText, status?.opcua],
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      {/* Header with title and status */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">System Status</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <StatusIndicator status={overallStatus} />
          <Tooltip title="Refresh Status">
            <span>
              <IconButton
                size="small"
                onClick={handleRefresh}
                disabled={loading || isRefreshing}
                sx={{ ml: 1 }}
              >
                {loading || isRefreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Details view or simplified view based on configuration */}
      {showDetails ? (
        <List disablePadding sx={{ flexGrow: 1 }}>
          <ListItem>
            <ListItemIcon>
              <StorageIcon color={getIconColor(status?.database)} />
            </ListItemIcon>
            <ListItemText primary="Database" secondary={dbStatusText} />
            <StatusIndicator status={status?.database} />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <DnsIcon color={getIconColor(status?.opcua)} />
            </ListItemIcon>
            <ListItemText primary="OPC UA Server" secondary={opcuaStatusText} />
            <StatusIndicator status={status?.opcua} />
          </ListItem>
        </List>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 2,
            flexGrow: 1,
          }}
        >
          {isConnected ? (
            <Typography variant="h6" color="success.main" sx={{ mb: 2 }}>
              All systems operational
            </Typography>
          ) : hasError ? (
            <Typography variant="h6" color="error.main" sx={{ mb: 2 }}>
              System experiencing issues
            </Typography>
          ) : (
            <Typography variant="h6" color="warning.main" sx={{ mb: 2 }}>
              System partially degraded
            </Typography>
          )}

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body2">Database: {dbStatusText}</Typography>
            <Typography variant="body2">OPC UA: {opcuaStatusText}</Typography>
          </Box>
        </Box>
      )}

      <Divider sx={{ mt: 'auto', mb: 1 }} />

      {/* Footer with last updated info */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="caption" color="textSecondary">
          Last updated: {formattedLastUpdated}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          Auto-refresh: On
        </Typography>
      </Box>
    </Box>
  );
});

SystemStatusWidget.displayName = 'SystemStatusWidget';

export default SystemStatusWidget;
