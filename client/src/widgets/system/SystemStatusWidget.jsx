// File: src/widgets/system/SystemStatusWidget.jsx
import React, { memo } from 'react';
import PropTypes from 'prop-types';
import {
    Card,
    CardContent,
    Typography,
    Box,
    Chip,
    Divider,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    CircularProgress,
    IconButton,
    Tooltip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';

// Mock data and functions until we properly integrate the custom hook
const useSystemStatusData = ({ autoRefresh, refreshInterval, onError }) => {
    const [status, setStatus] = React.useState({
        database: { status: 'ok', statusText: 'Connected' },
        opcua: { status: 'ok', statusText: 'Connected' }
    });
    const [loading, setLoading] = React.useState(false);
    const [lastUpdated, setLastUpdated] = React.useState(new Date());

    // Mock fetch function
    const fetchStatus = React.useCallback(() => {
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            setLastUpdated(new Date());
        }, 500);
    }, []);

    // Calculate overall status
    const getOverallStatus = React.useCallback(() => {
        if (!status) return 'unknown';

        const dbStatus = (status.database?.status || '').toLowerCase();
        const opcStatus = (status.opcua?.status || '').toLowerCase();

        if (dbStatus === 'error' || opcStatus === 'error') {
            return 'error';
        } else if (dbStatus === 'warning' || opcStatus === 'warning') {
            return 'warning';
        } else if (dbStatus === 'ok' && opcStatus === 'ok') {
            return 'ok';
        } else {
            return 'unknown';
        }
    }, [status]);

    return {
        status,
        loading,
        lastUpdated,
        overallStatus: getOverallStatus(),
        fetchStatus
    };
};

// Status indicator component
const StatusIndicator = memo(({ status }) => {
    // Convert status to lowercase for consistent comparison
    const statusStr = typeof status === 'string'
        ? status.toLowerCase()
        : (status?.status || '').toLowerCase();

    // Determine icon, color, and label based on status
    let icon, color, label;

    switch (statusStr) {
        case 'online':
        case 'connected':
        case 'healthy':
        case 'ok':
            icon = <CheckCircleIcon />;
            color = 'success';
            label = 'Online';
            break;
        case 'warning':
        case 'degraded':
            icon = <WarningIcon />;
            color = 'warning';
            label = 'Degraded';
            break;
        case 'error':
        case 'offline':
        case 'disconnected':
            icon = <ErrorIcon />;
            color = 'error';
            label = 'Offline';
            break;
        default:
            icon = <WarningIcon />;
            color = 'default';
            label = 'Unknown';
    }

    return (
        <Chip
            icon={icon}
            label={label}
            color={color}
            variant="outlined"
            size="small"
            sx={{ fontWeight: 'bold' }}
        />
    );
});

StatusIndicator.propTypes = {
    status: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.object
    ])
};

StatusIndicator.displayName = 'StatusIndicator';

/**
 * SystemStatusWidget displays the current status of system components
 */
const SystemStatusWidget = memo(({ config = {}, onError }) => {
    // Merge default config with provided config
    const widgetConfig = {
        autoRefresh: true,
        showDetails: true,
        refreshInterval: 20000,
        ...config
    };

    const { autoRefresh, showDetails, refreshInterval } = widgetConfig;

    // Use custom hook for data fetching and state management
    const {
        status,
        loading,
        lastUpdated,
        overallStatus,
        fetchStatus,
    } = useSystemStatusData({
        autoRefresh,
        refreshInterval,
        onError
    });

    // Format the last updated time
    const formattedLastUpdated = lastUpdated
        ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'Never';

    // Format status text for display - Handle both string and object formats
    const formatStatusText = (statusValue) => {
        if (!statusValue) return 'Unknown';

        // If it's an object with statusText, use that
        if (typeof statusValue === 'object' && statusValue.statusText) {
            return statusValue.statusText;
        }

        // If it's an object with status, use that
        if (typeof statusValue === 'object' && statusValue.status) {
            const statusStr = String(statusValue.status);
            return statusStr.charAt(0).toUpperCase() + statusStr.slice(1).toLowerCase();
        }

        // If it's a string, capitalize it
        if (typeof statusValue === 'string') {
            return statusValue.charAt(0).toUpperCase() + statusValue.slice(1).toLowerCase();
        }

        // Fallback
        return 'Unknown';
    };

    // Helper to get the appropriate icon color
    const getIconColor = (statusValue) => {
        if (!statusValue) return 'error';

        const status = typeof statusValue === 'object'
            ? statusValue.status?.toLowerCase()
            : statusValue.toLowerCase();

        return status === 'ok' || status === 'connected' ? 'success' : 'error';
    };

    return (
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Header with title and status */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                        System Status
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <StatusIndicator status={overallStatus} />
                        <Tooltip title="Refresh Status">
              <span>
                <IconButton
                    size="small"
                    onClick={fetchStatus}
                    disabled={loading}
                    sx={{ ml: 1 }}
                >
                  {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
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
                            <ListItemText
                                primary="Database"
                                secondary={formatStatusText(status?.database)}
                            />
                            <StatusIndicator status={status?.database} />
                        </ListItem>

                        <ListItem>
                            <ListItemIcon>
                                <DnsIcon color={getIconColor(status?.opcua)} />
                            </ListItemIcon>
                            <ListItemText
                                primary="OPC UA Server"
                                secondary={formatStatusText(status?.opcua)}
                            />
                            <StatusIndicator status={status?.opcua} />
                        </ListItem>
                    </List>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2, flexGrow: 1 }}>
                        <Typography
                            variant="h3"
                            color={
                                overallStatus === 'ok' ? 'success.main' :
                                    overallStatus === 'warning' ? 'warning.main' :
                                        overallStatus === 'error' ? 'error.main' : 'text.secondary'
                            }
                            sx={{ mb: 2 }}
                        >
                            {overallStatus === 'ok' ? <CheckCircleIcon fontSize="inherit" /> :
                                overallStatus === 'warning' ? <WarningIcon fontSize="inherit" /> :
                                    overallStatus === 'error' ? <ErrorIcon fontSize="inherit" /> : '?'}
                        </Typography>
                        <Typography variant="body1" align="center">
                            {overallStatus === 'ok' ? 'All systems operational' :
                                overallStatus === 'warning' ? 'System partially degraded' :
                                    overallStatus === 'error' ? 'System experiencing issues' : 'Status unknown'}
                        </Typography>
                    </Box>
                )}

                <Divider sx={{ mt: 'auto', mb: 1 }} />

                {/* Footer with last updated info */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="textSecondary">
                        Last updated: {formattedLastUpdated}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                        {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );
});

SystemStatusWidget.propTypes = {
    /** Widget configuration */
    config: PropTypes.shape({
        /** Enable automatic refresh */
        autoRefresh: PropTypes.bool,
        /** Show detailed system information */
        showDetails: PropTypes.bool,
        /** Refresh interval in milliseconds */
        refreshInterval: PropTypes.number
    }),
    /** Error handler callback */
    onError: PropTypes.func
};

SystemStatusWidget.displayName = 'SystemStatusWidget';

export default SystemStatusWidget;