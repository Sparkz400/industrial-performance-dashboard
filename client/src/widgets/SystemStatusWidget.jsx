import React, { useState, useEffect, useCallback } from 'react';
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
    Tooltip,
    FormControlLabel,
    Switch
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import { API_ENDPOINTS, POLLING_INTERVAL_MS } from '../config/config';

// Settings component for the widget
export const SystemStatusSettings = ({ config = {}, onConfigChange }) => {
    // Get the current auto-refresh setting, defaulting to true if not provided
    const autoRefresh = config.autoRefresh !== undefined ? config.autoRefresh : true;
    const showDetails = config.showDetails !== undefined ? config.showDetails : true;

    const handleAutoRefreshChange = (event) => {
        onConfigChange({ ...config, autoRefresh: event.target.checked });
    };

    const handleShowDetailsChange = (event) => {
        onConfigChange({ ...config, showDetails: event.target.checked });
    };

    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Display Settings</Typography>

            <Box sx={{ mb: 2 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={autoRefresh}
                            onChange={handleAutoRefreshChange}
                            color="primary"
                        />
                    }
                    label="Auto-refresh status"
                />
                <Typography variant="caption" color="textSecondary" display="block">
                    When enabled, status will automatically refresh every {POLLING_INTERVAL_MS/1000} seconds
                </Typography>
            </Box>

            <Box>
                <FormControlLabel
                    control={
                        <Switch
                            checked={showDetails}
                            onChange={handleShowDetailsChange}
                            color="primary"
                        />
                    }
                    label="Show detailed information"
                />
                <Typography variant="caption" color="textSecondary" display="block">
                    Display additional system status details
                </Typography>
            </Box>
        </Box>
    );
};

// Status indicator component
const StatusIndicator = ({ status }) => {
    let icon, color, label;

    const statusStr = (status || '').toLowerCase();

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
};

// Format status string for display
const formatStatusText = (statusStr) => {
    if (!statusStr) return 'Unknown';

    // Capitalize first letter
    return statusStr.charAt(0).toUpperCase() + statusStr.slice(1);
};

// Main widget component
const SystemStatusWidget = ({ config = {} }) => {
    const [status, setStatus] = useState({ database: 'unknown', opcua: 'unknown' });
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isPolling, setIsPolling] = useState(false); // Flag to prevent parallel polling

    // Determine if we should auto-refresh (default to true if not specified)
    const autoRefresh = config.autoRefresh !== undefined ? config.autoRefresh : true;
    const showDetails = config.showDetails !== undefined ? config.showDetails : true;

    // Function to fetch the status
    const fetchStatus = useCallback(async () => {
        if (isPolling) return; // Prevent parallel requests

        setIsPolling(true);
        setLoading(true);

        try {
            const res = await fetch(API_ENDPOINTS.opcua.status);
            if (!res.ok) throw new Error('Failed to fetch status');

            const data = await res.json();
            setStatus(data);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Error fetching status:', error);
            // Don't update status on error to keep the last known state
        } finally {
            setLoading(false);
            setIsPolling(false);
        }
    }, [isPolling]);

    // Initial fetch and setup auto-refresh if enabled
    useEffect(() => {
        void fetchStatus();

        if (autoRefresh) {
            const interval = setInterval(fetchStatus, POLLING_INTERVAL_MS);
            return () => clearInterval(interval);
        }
    }, [fetchStatus, autoRefresh]);

    // Format the last updated time
    const formattedLastUpdated = lastUpdated
        ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'Never';

    // Overall system status based on component statuses
    const getOverallStatus = () => {
        if (!status) return 'unknown';

        const dbStatus = status.database || 'unknown';
        const opcStatus = status.opcua || 'unknown';

        if (dbStatus === 'error' || opcStatus === 'error') {
            return 'error';
        } else if (dbStatus === 'warning' || opcStatus === 'warning') {
            return 'warning';
        } else if (dbStatus === 'ok' && opcStatus === 'ok') {
            return 'ok';
        } else {
            return 'unknown';
        }
    };

    const overallStatus = getOverallStatus();

    return (
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                        System Status
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <StatusIndicator status={overallStatus} />
                        <Tooltip title="Refresh Status">
              <span> {/* Wrapper to handle disabled state */}
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

                {showDetails ? (
                    <List disablePadding sx={{ flexGrow: 1 }}>
                        <ListItem>
                            <ListItemIcon>
                                <StorageIcon color={status?.database === 'ok' ? 'success' : 'error'} />
                            </ListItemIcon>
                            <ListItemText
                                primary="Database"
                                secondary={formatStatusText(status?.database || 'Unknown')}
                            />
                            <StatusIndicator status={status?.database} />
                        </ListItem>

                        <ListItem>
                            <ListItemIcon>
                                <DnsIcon color={status?.opcua === 'ok' ? 'success' : 'error'} />
                            </ListItemIcon>
                            <ListItemText
                                primary="OPC UA Server"
                                secondary={formatStatusText(status?.opcua || 'Unknown')}
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
};

export default SystemStatusWidget;