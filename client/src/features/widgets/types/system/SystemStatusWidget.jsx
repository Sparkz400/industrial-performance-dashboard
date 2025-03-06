import React, { memo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
    Card,
    CardContent,
    Typography,
    Box,
    Divider,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    IconButton,
    Tooltip,
    CircularProgress
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import StatusIndicator from './components/StatusIndicator.jsx';
import { useSystemStatusData } from './hooks/useSystemStatusData.js';

/**
 * SystemStatusWidget displays the current status of system components
 * using real data from the backend
 */
const SystemStatusWidget = memo(({ config = {}, onError }) => {
    // Get configuration with defaults
    const {
        autoRefresh = true,
        showDetails = true,
        refreshInterval = 20000
    } = config;

    // Use custom hook for data fetching and state management
    const {
        status,
        loading,
        lastUpdated,
        overallStatus,
        fetchStatus,
        isConnected,
        hasError,
        isAutoRefreshEnabled
    } = useSystemStatusData({
        autoRefresh,
        refreshInterval,
        onError
    });

    // Manual refresh handler with debounce protection
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    const handleRefresh = useCallback(() => {
        if (isRefreshing || loading) return;

        setIsRefreshing(true);

        // Perform the refresh and reset the state after completion
        Promise.resolve(fetchStatus())
            .catch(err => {
                console.error("Manual refresh error:", err);
            })
            .finally(() => {
                // Prevent button spam with a short cooldown
                setTimeout(() => setIsRefreshing(false), 2000);
            });
    }, [fetchStatus, isRefreshing, loading]);

    // Format the last updated time
    const formattedLastUpdated = lastUpdated
        ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'Never';

    // Format status text for display
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

    // Get appropriate icon color based on status
    const getIconColor = (statusValue) => {
        if (!statusValue) return 'error';

        const status = typeof statusValue === 'object'
            ? statusValue.status?.toLowerCase()
            : statusValue.toLowerCase();

        return status === 'ok' || status === 'connected' ? 'success' : 'error';
    };

    // Get the database and OPCUA status text
    const dbStatusText = formatStatusText(status?.database);
    const opcuaStatusText = formatStatusText(status?.opcua);

    return (
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
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
                                    onClick={handleRefresh}
                                    disabled={loading || isRefreshing}
                                    sx={{ ml: 1 }}
                                >
                                    {(loading || isRefreshing) ?
                                        <CircularProgress size={20} /> :
                                        <RefreshIcon />
                                    }
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
                                secondary={dbStatusText}
                            />
                            <StatusIndicator status={status?.database} />
                        </ListItem>

                        <ListItem>
                            <ListItemIcon>
                                <DnsIcon color={getIconColor(status?.opcua)} />
                            </ListItemIcon>
                            <ListItemText
                                primary="OPC UA Server"
                                secondary={opcuaStatusText}
                            />
                            <StatusIndicator status={status?.opcua} />
                        </ListItem>
                    </List>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2, flexGrow: 1 }}>
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
                            <Typography variant="body2">
                                Database: {dbStatusText}
                            </Typography>
                            <Typography variant="body2">
                                OPC UA: {opcuaStatusText}
                            </Typography>
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
                        Auto-refresh: {isAutoRefreshEnabled ?
                        `On (${refreshInterval/1000}s)` :
                        'Off'}
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