// File: src/pages/settingsPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Typography,
    Box,
    TextField,
    Button,
    Paper,
    Tab,
    Tabs,
    Card,
    CardContent,
    CardHeader,
    Divider,
    Switch,
    FormControlLabel,
    LinearProgress,
    Stack,
    Avatar,
    IconButton,
    Tooltip,
    Chip,
    Alert,
    Collapse,
    Backdrop,
    CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { useTheme } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import LanguageIcon from '@mui/icons-material/Language';
import StorageIcon from '@mui/icons-material/Storage';
import DnsIcon from '@mui/icons-material/Dns';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import PaletteIcon from '@mui/icons-material/Palette';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InfoIcon from '@mui/icons-material/Info';
import CodeIcon from '@mui/icons-material/Code';
import BrowserUpdatedIcon from '@mui/icons-material/BrowserUpdated';
import CachedIcon from '@mui/icons-material/Cached';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import MemoryIcon from '@mui/icons-material/Memory';
import { API_ENDPOINTS } from '../config/config';
import { useSystemStatus } from '../contexts/StatusContext.jsx';

// Panel to display with each tab
function TabPanel(props) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`settings-tabpanel-${index}`}
            aria-labelledby={`settings-tab-${index}`}
            style={{ width: '100%' }}
            {...other}
        >
            {value === index && (
                <Box sx={{ pt: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

// Status indicator component
const StatusIndicator = ({ status, label, description, icon, loading = false }) => {
    const theme = useTheme();

    // Determine color based on status
    const getStatusColor = () => {
        if (loading) return theme.palette.info.main;

        switch(status?.toLowerCase()) {
            case 'connected':
            case 'online':
            case 'ok':
                return theme.palette.success.main;
            case 'warning':
            case 'degraded':
                return theme.palette.warning.main;
            case 'error':
            case 'offline':
            case 'disconnected':
                return theme.palette.error.main;
            default:
                return theme.palette.text.disabled;
        }
    };

    // Get icon based on status
    const getStatusIcon = () => {
        if (loading) return <CircularProgress size={24} color="inherit" />;

        switch(status?.toLowerCase()) {
            case 'connected':
            case 'online':
            case 'ok':
                return <CheckCircleIcon />;
            case 'warning':
            case 'degraded':
                return <WarningIcon />;
            case 'error':
            case 'offline':
            case 'disconnected':
                return <ErrorIcon />;
            default:
                return icon || <InfoIcon />;
        }
    };

    return (
        <Card variant="outlined" sx={{
            position: 'relative',
            overflow: 'visible',
            mb: 2,
            transition: 'all 0.3s ease',
            '&:hover': {
                boxShadow: 3,
                transform: 'translateY(-2px)'
            }
        }}>
            <Box sx={{
                position: 'absolute',
                top: '-16px',
                left: '16px',
                backgroundColor: getStatusColor(),
                borderRadius: '50%',
                p: 1,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 2
            }}>
                {getStatusIcon()}
            </Box>
            <CardContent sx={{ pt: 4, pl: 2, pb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography variant="h6" fontWeight="medium" gutterBottom>
                            {label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {description}
                        </Typography>
                    </Box>
                    <Chip
                        label={loading ? 'Checking...' : status || 'Unknown'}
                        color={loading ? 'info' : getStatusColor() === theme.palette.success.main ? 'success' :
                            getStatusColor() === theme.palette.warning.main ? 'warning' :
                                getStatusColor() === theme.palette.error.main ? 'error' : 'default'}
                        size="small"
                        variant={loading ? 'outlined' : 'filled'}
                    />
                </Box>
            </CardContent>
        </Card>
    );
};

// Main settings page component
const SettingsPage = () => {
    // Tab state
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(false);
    const [configChanged, setConfigChanged] = useState(false);
    const [backupInProgress, setBackupInProgress] = useState(false);
    const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'info' });

    // Form states
    const [ip, setIp] = useState('localhost');
    const [port, setPort] = useState('4840');
    const [resourcePath, setResourcePath] = useState('/UA/MyLittleServer');
    const [dbHost, setDbHost] = useState('localhost');
    const [dbPort, setDbPort] = useState('5432');
    const [dbUser, setDbUser] = useState('postgres');
    const [dbName, setDbName] = useState('postgres');

    // Status states
    const [opcuaConnected, setOpcuaConnected] = useState(false);
    const [dbOnline, setDbOnline] = useState(false);
    const [connectionHistory, setConnectionHistory] = useState([]);
    const [connectedAddress, setConnectedAddress] = useState('');
    const [systemStats, setSystemStats] = useState(null);

    // Theme states
    const [themeMode, setThemeMode] = useState(localStorage.getItem('themeMode') || 'dark');
    const [useSystemTheme, setUseSystemTheme] = useState(false);

    // Get system status context
    const { status, refreshStatus, lastChecked } = useSystemStatus();

    // Handle tab change
    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    // Sanitize port input
    const sanitizePort = (value) => {
        const port = parseInt(value, 10);
        return (port > 0 && port <= 65535) ? port : 4840;
    };

    // Format date for display
    const formatDate = (date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString();
    };

    // Handle OPC UA connection
    const handleConnect = async () => {
        setLoading(true);
        try {
            const sanitizedPort = sanitizePort(port);
            const res = await fetch(API_ENDPOINTS.opcua.connect, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip, port: sanitizedPort, resourcePath })
            });

            const data = await res.json();

            if (res.ok) {
                setOpcuaConnected(true);
                setConnectedAddress(`${ip}:${sanitizedPort}`);
                setConnectionHistory(prev => [{
                    event: 'Connected',
                    timestamp: new Date().toISOString(),
                    details: `Connected to ${ip}:${sanitizedPort}`
                }, ...prev.slice(0, 9)]);
                setAlertInfo({
                    open: true,
                    message: 'Successfully connected to OPC UA server',
                    severity: 'success'
                });
                refreshStatus();
            } else {
                setAlertInfo({
                    open: true,
                    message: `Failed to connect: ${data.error || 'Unknown error'}`,
                    severity: 'error'
                });
                setConnectionHistory(prev => [{
                    event: 'Connection Failed',
                    timestamp: new Date().toISOString(),
                    details: data.error || 'Unknown error'
                }, ...prev.slice(0, 9)]);
            }
        } catch (err) {
            console.error('Error connecting to OPC UA:', err);
            setAlertInfo({
                open: true,
                message: `Error connecting: ${err.message}`,
                severity: 'error'
            });
            setConnectionHistory(prev => [{
                event: 'Connection Error',
                timestamp: new Date().toISOString(),
                details: err.message
            }, ...prev.slice(0, 9)]);
        } finally {
            setLoading(false);
        }
    };

    // Handle OPC UA disconnection
    const handleDisconnect = async () => {
        setLoading(true);
        try {
            const res = await fetch(API_ENDPOINTS.opcua.disconnect, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await res.json();

            if (res.ok) {
                setOpcuaConnected(false);
                setConnectedAddress('');
                setConnectionHistory(prev => [{
                    event: 'Disconnected',
                    timestamp: new Date().toISOString(),
                    details: 'Manually disconnected'
                }, ...prev.slice(0, 9)]);
                setAlertInfo({
                    open: true,
                    message: 'Successfully disconnected from OPC UA server',
                    severity: 'info'
                });
                refreshStatus();
            } else {
                setAlertInfo({
                    open: true,
                    message: `Failed to disconnect: ${data.error || 'Unknown error'}`,
                    severity: 'error'
                });
            }
        } catch (err) {
            console.error('Error disconnecting from OPC UA:', err);
            setAlertInfo({
                open: true,
                message: `Error disconnecting: ${err.message}`,
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    // Handle test database connection
    const handleTestDbConnection = async () => {
        setLoading(true);
        try {
            const res = await fetch(API_ENDPOINTS.dbTest);
            const data = await res.json();

            if (res.ok) {
                setDbOnline(true);
                setAlertInfo({
                    open: true,
                    message: 'Database connection successful',
                    severity: 'success'
                });
                refreshStatus();
            } else {
                setDbOnline(false);
                setAlertInfo({
                    open: true,
                    message: `Database connection failed: ${data.error || 'Unknown error'}`,
                    severity: 'error'
                });
            }
        } catch (err) {
            console.error('Error testing database connection:', err);
            setDbOnline(false);
            setAlertInfo({
                open: true,
                message: `Database error: ${err.message}`,
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    // Handle export dashboards
    const handleExportDashboards = () => {
        setBackupInProgress(true);
        try {
            // Get dashboard data from localStorage
            const dashboardData = localStorage.getItem('dashboardData');

            if (!dashboardData) {
                setAlertInfo({
                    open: true,
                    message: 'No dashboard data to export',
                    severity: 'warning'
                });
                return;
            }

            // Create a JSON blob and download
            const blob = new Blob([dashboardData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dashboard-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setAlertInfo({
                open: true,
                message: 'Dashboards exported successfully',
                severity: 'success'
            });
        } catch (err) {
            console.error('Error exporting dashboards:', err);
            setAlertInfo({
                open: true,
                message: `Export error: ${err.message}`,
                severity: 'error'
            });
        } finally {
            setBackupInProgress(false);
        }
    };

    // Handle import dashboards - file input ref
    const fileInputRef = React.useRef(null);

    // Handle file selection for import
    const handleFileSelected = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setBackupInProgress(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Validate data structure
                if (!data.dashboards || !Array.isArray(data.dashboards)) {
                    throw new Error('Invalid dashboard data format');
                }

                // Save to localStorage
                localStorage.setItem('dashboardData', e.target.result);

                setAlertInfo({
                    open: true,
                    message: `Imported ${data.dashboards.length} dashboards successfully. Reload the dashboard page to see changes.`,
                    severity: 'success'
                });
            } catch (err) {
                console.error('Error importing dashboards:', err);
                setAlertInfo({
                    open: true,
                    message: `Import error: ${err.message}`,
                    severity: 'error'
                });
            } finally {
                setBackupInProgress(false);
                // Reset file input
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };

        reader.onerror = () => {
            setAlertInfo({
                open: true,
                message: 'Error reading file',
                severity: 'error'
            });
            setBackupInProgress(false);
        };

        reader.readAsText(file);
    };

    // Trigger file input click
    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // Update theme settings
    const handleThemeChange = (mode) => {
        setThemeMode(mode);
        localStorage.setItem('themeMode', mode);
        setAlertInfo({
            open: true,
            message: `Theme updated to ${mode} mode`,
            severity: 'success'
        });
        // In a real app, you'd update the theme context/provider here
    };

    // Handle refresh status
    const handleRefreshStatus = async () => {
        setLoading(true);
        await refreshStatus();
        fetchConnectionStatus();
        setLoading(false);
    };

    // Fetch system stats
    const fetchSystemStats = async () => {
        try {
            // This would be a real endpoint in a production app
            // For demo, we'll simulate with mock data
            const stats = {
                uptime: Math.floor(Math.random() * 1000000), // seconds
                memoryUsage: {
                    total: 8192, // MB
                    used: Math.floor(Math.random() * 4000 + 2000), // MB
                },
                cpuUsage: Math.floor(Math.random() * 70 + 10), // percentage
                activeConnections: Math.floor(Math.random() * 10 + 1),
                lastRestart: new Date(Date.now() - Math.random() * 86400000 * 10).toISOString()
            };

            setSystemStats(stats);
        } catch (err) {
            console.error('Error fetching system stats:', err);
        }
    };

    // Fetch OPC UA connection status
    const fetchConnectionStatus = async () => {
        try {
            const res = await fetch(API_ENDPOINTS.opcua.status);
            const data = await res.json();

            if (res.ok) {
                setOpcuaConnected(data.connected);

                if (data.connected && data.config) {
                    setIp(data.config.ip);
                    setPort(data.config.port.toString());
                    setResourcePath(data.config.resourcePath);
                    setConnectedAddress(`${data.config.ip}:${data.config.port}`);
                } else {
                    setConnectedAddress('');
                }
            } else {
                console.error('Error fetching status:', data.error);
            }
        } catch (err) {
            console.error('Error fetching connection status:', err);
        }
    };

    // Format uptime for display
    const formatUptime = (seconds) => {
        if (!seconds) return 'Unknown';

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        return `${days}d ${hours}h ${minutes}m`;
    };

    // Load data on component mount
    useEffect(() => {
        fetchConnectionStatus();
        fetchSystemStats();
        // Set initial DB status based on system status
        setDbOnline(status?.database?.status === 'CONNECTED' || status?.database === 'connected');
    }, [status]);

    // Handle form changes
    useEffect(() => {
        // Set config changed flag when form values change
        const isChanged = ip !== (status?.opcua?.details?.config?.ip || 'localhost') ||
            port !== (status?.opcua?.details?.config?.port?.toString() || '4840') ||
            resourcePath !== (status?.opcua?.details?.config?.resourcePath || '/UA/MyLittleServer');

        setConfigChanged(isChanged);
    }, [ip, port, resourcePath, status]);

    return (
        <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>
            <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
                Settings
                <Tooltip title="Refresh Status">
                    <IconButton
                        onClick={handleRefreshStatus}
                        size="small"
                        sx={{ ml: 2 }}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} /> : <RefreshIcon />}
                    </IconButton>
                </Tooltip>
            </Typography>

            {/* Alert for notifications */}
            <Collapse in={alertInfo.open}>
                <Alert
                    severity={alertInfo.severity}
                    onClose={() => setAlertInfo({...alertInfo, open: false})}
                    sx={{ mb: 2 }}
                >
                    {alertInfo.message}
                </Alert>
            </Collapse>

            {/* Status overview cards */}
            <Typography variant="h6" gutterBottom>
                System Status
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
                Last updated: {formatDate(lastChecked)}
            </Typography>

            <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={12} md={6}>
                    <StatusIndicator
                        status={status?.database?.statusText || status?.database || 'Unknown'}
                        label="Database Connection"
                        description={dbOnline ? `Connected to ${dbHost}:${dbPort}` : 'Not connected'}
                        icon={<StorageIcon />}
                        loading={loading}
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <StatusIndicator
                        status={status?.opcua?.statusText || status?.opcua || 'Unknown'}
                        label="OPC UA Connection"
                        description={opcuaConnected ? `Connected to ${connectedAddress}` : 'Not connected'}
                        icon={<DnsIcon />}
                        loading={loading}
                    />
                </Grid>
            </Grid>

            {/* Settings tabs */}
            <Paper sx={{ width: '100%', mb: 2 }}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    variant="scrollable"
                    scrollButtons="auto"
                    aria-label="settings tabs"
                >
                    <Tab label="Connections" id="settings-tab-0" icon={<LanguageIcon />} iconPosition="start" />
                    <Tab label="Appearance" id="settings-tab-1" icon={<PaletteIcon />} iconPosition="start" />
                    <Tab label="Backup & Restore" id="settings-tab-2" icon={<SettingsBackupRestoreIcon />} iconPosition="start" />
                    <Tab label="System Info" id="settings-tab-3" icon={<InfoIcon />} iconPosition="start" />
                </Tabs>

                {/* Connection settings tab */}
                <TabPanel value={tabValue} index={0}>
                    <Grid container spacing={3}>
                        {/* OPC UA Connection Settings */}
                        <Grid item xs={12} lg={6}>
                            <Card>
                                <CardHeader
                                    title="OPC UA Server Connection"
                                    avatar={<Avatar><DnsIcon /></Avatar>}
                                    action={
                                        <Chip
                                            label={opcuaConnected ? 'Connected' : 'Disconnected'}
                                            color={opcuaConnected ? 'success' : 'default'}
                                            size="small"
                                        />
                                    }
                                />
                                <Divider />
                                <CardContent>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="IP Address"
                                                variant="outlined"
                                                fullWidth
                                                value={ip}
                                                onChange={(e) => setIp(e.target.value)}
                                                disabled={opcuaConnected}
                                                helperText={opcuaConnected ? "Disconnect first to change" : ""}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Port"
                                                variant="outlined"
                                                fullWidth
                                                value={port}
                                                onChange={(e) => setPort(e.target.value)}
                                                disabled={opcuaConnected}
                                                helperText={opcuaConnected ? "Disconnect first to change" : ""}
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <TextField
                                                label="Resource Path"
                                                variant="outlined"
                                                fullWidth
                                                value={resourcePath}
                                                onChange={(e) => setResourcePath(e.target.value)}
                                                disabled={opcuaConnected}
                                                helperText={opcuaConnected ? "Disconnect first to change" : ""}
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <Box display="flex" justifyContent="space-between">
                                                <Box>
                                                    <Button
                                                        variant="contained"
                                                        color="primary"
                                                        onClick={handleConnect}
                                                        disabled={opcuaConnected || loading}
                                                        startIcon={<PlayCircleOutlineIcon />}
                                                        sx={{ mr: 1 }}
                                                    >
                                                        Connect
                                                    </Button>
                                                    <Button
                                                        variant="outlined"
                                                        color="secondary"
                                                        onClick={handleDisconnect}
                                                        disabled={!opcuaConnected || loading}
                                                        startIcon={<StopCircleIcon />}
                                                    >
                                                        Disconnect
                                                    </Button>
                                                </Box>
                                                <Tooltip title="Reset to defaults">
                                                    <span>
                                                        <Button
                                                            variant="text"
                                                            onClick={() => {
                                                                setIp('localhost');
                                                                setPort('4840');
                                                                setResourcePath('/UA/MyLittleServer');
                                                            }}
                                                            disabled={opcuaConnected}
                                                        >
                                                            Reset
                                                        </Button>
                                                    </span>
                                                </Tooltip>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Database Connection Settings */}
                        <Grid item xs={12} lg={6}>
                            <Card>
                                <CardHeader
                                    title="Database Connection"
                                    avatar={<Avatar><StorageIcon /></Avatar>}
                                    action={
                                        <Chip
                                            label={dbOnline ? 'Connected' : 'Disconnected'}
                                            color={dbOnline ? 'success' : 'default'}
                                            size="small"
                                        />
                                    }
                                />
                                <Divider />
                                <CardContent>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Host"
                                                variant="outlined"
                                                fullWidth
                                                value={dbHost}
                                                onChange={(e) => setDbHost(e.target.value)}
                                                disabled={true}
                                                helperText="Edit in environment config"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Port"
                                                variant="outlined"
                                                fullWidth
                                                value={dbPort}
                                                onChange={(e) => setDbPort(e.target.value)}
                                                disabled={true}
                                                helperText="Edit in environment config"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="User"
                                                variant="outlined"
                                                fullWidth
                                                value={dbUser}
                                                onChange={(e) => setDbUser(e.target.value)}
                                                disabled={true}
                                                helperText="Edit in environment config"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Database"
                                                variant="outlined"
                                                fullWidth
                                                value={dbName}
                                                onChange={(e) => setDbName(e.target.value)}
                                                disabled={true}
                                                helperText="Edit in environment config"
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                onClick={handleTestDbConnection}
                                                disabled={loading}
                                                startIcon={<CachedIcon />}
                                            >
                                                Test Connection
                                            </Button>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Connection History Log */}
                        <Grid item xs={12}>
                            <Card>
                                <CardHeader
                                    title="Connection History"
                                    avatar={<Avatar><CodeIcon /></Avatar>}
                                />
                                <Divider />
                                <CardContent>
                                    {connectionHistory.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary" align="center">
                                            No connection history available
                                        </Typography>
                                    ) : (
                                        <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                                            {connectionHistory.map((entry, index) => (
                                                <Box key={index} sx={{ mb: 1, p: 1, borderBottom: index < connectionHistory.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="subtitle2">{entry.event}</Typography>
                                                        <Typography variant="caption">{formatDate(entry.timestamp)}</Typography>
                                                    </Box>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {entry.details}
                                                    </Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Appearance settings tab */}
                <TabPanel value={tabValue} index={1}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardHeader
                                    title="Theme Settings"
                                    avatar={<Avatar><PaletteIcon /></Avatar>}
                                />
                                <Divider />
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Choose Theme
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                                        <Card
                                            sx={{
                                                width: 120,
                                                height: 80,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                bgcolor: 'background.paper',
                                                color: 'text.primary',
                                                border: themeMode === 'light' ? '2px solid' : '1px solid',
                                                borderColor: themeMode === 'light' ? 'primary.main' : 'divider',
                                                '&:hover': { boxShadow: 2 }
                                            }}
                                            onClick={() => handleThemeChange('light')}
                                        >
                                            <LightModeIcon sx={{ mb: 1 }} />
                                            <Typography variant="body2">Light</Typography>
                                        </Card>

                                        <Card
                                            sx={{
                                                width: 120,
                                                height: 80,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                bgcolor: '#1e1f22',
                                                color: '#fff',
                                                border: themeMode === 'dark' ? '2px solid' : '1px solid',
                                                borderColor: themeMode === 'dark' ? 'primary.main' : 'divider',
                                                '&:hover': { boxShadow: 2 }
                                            }}
                                            onClick={() => handleThemeChange('dark')}
                                        >
                                            <DarkModeIcon sx={{ mb: 1 }} />
                                            <Typography variant="body2">Dark</Typography>
                                        </Card>

                                        <Card
                                            sx={{
                                                width: 120,
                                                height: 80,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                bgcolor: 'background.paper',
                                                color: 'text.primary',
                                                border: useSystemTheme ? '2px solid' : '1px solid',
                                                borderColor: useSystemTheme ? 'primary.main' : 'divider',
                                                '&:hover': { boxShadow: 2 }
                                            }}
                                            onClick={() => setUseSystemTheme(!useSystemTheme)}
                                        >
                                            <BrightnessAutoIcon sx={{ mb: 1 }} />
                                            <Typography variant="body2">System</Typography>
                                        </Card>
                                    </Box>

                                    <Box sx={{ mt: 3 }}>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={useSystemTheme}
                                                    onChange={(e) => setUseSystemTheme(e.target.checked)}
                                                    color="primary"
                                                />
                                            }
                                            label="Use system theme preference"
                                        />
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardHeader
                                    title="Interface Settings"
                                    avatar={<Avatar><BrowserUpdatedIcon /></Avatar>}
                                />
                                <Divider />
                                <CardContent>
                                    <FormControlLabel
                                        control={
                                            <Switch defaultChecked color="primary" />
                                        }
                                        label="Show tooltips"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch defaultChecked color="primary" />
                                        }
                                        label="Animated transitions"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch defaultChecked color="primary" />
                                        }
                                        label="Sidebar auto-collapse"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch color="primary" />
                                        }
                                        label="Compact mode"
                                    />
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Backup & Restore tab */}
                <TabPanel value={tabValue} index={2}>
                    <Card>
                        <CardHeader
                            title="Dashboard Backup & Restore"
                            avatar={<Avatar><SettingsBackupRestoreIcon /></Avatar>}
                            subheader="Export and import your dashboard configurations"
                        />
                        <Divider />
                        <CardContent>
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>
                                                Export Dashboards
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                Download a backup file containing all your dashboards, widgets, and layouts
                                            </Typography>
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                startIcon={<CloudDownloadIcon />}
                                                onClick={handleExportDashboards}
                                                disabled={backupInProgress}
                                            >
                                                {backupInProgress ? 'Exporting...' : 'Export'}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </Grid>

                                <Grid item xs={12} md={6}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>
                                                Import Dashboards
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                Restore dashboards from a previously exported backup file
                                            </Typography>
                                            <input
                                                type="file"
                                                accept=".json"
                                                style={{ display: 'none' }}
                                                onChange={handleFileSelected}
                                                ref={fileInputRef}
                                            />
                                            <Button
                                                variant="contained"
                                                color="secondary"
                                                startIcon={<CloudUploadIcon />}
                                                onClick={handleImportClick}
                                                disabled={backupInProgress}
                                            >
                                                {backupInProgress ? 'Importing...' : 'Import'}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </Grid>

                                <Grid item xs={12}>
                                    <Alert severity="info">
                                        Note: Importing dashboards will override your current dashboard configuration.
                                        Make sure to export a backup of your current setup first if needed.
                                    </Alert>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </TabPanel>

                {/* System Info tab */}
                <TabPanel value={tabValue} index={3}>
                    <Card>
                        <CardHeader
                            title="System Information"
                            avatar={<Avatar><InfoIcon /></Avatar>}
                            subheader="Server and application status details"
                        />
                        <Divider />
                        <CardContent>
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Server Resources
                                    </Typography>

                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary" gutterBottom>
                                            Memory Usage
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Box sx={{ flexGrow: 1, mr: 1 }}>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={systemStats ? (systemStats.memoryUsage.used / systemStats.memoryUsage.total) * 100 : 0}
                                                    sx={{ height: 8, borderRadius: 5 }}
                                                />
                                            </Box>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats ? `${systemStats.memoryUsage.used} MB / ${systemStats.memoryUsage.total} MB` : 'Unknown'}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary" gutterBottom>
                                            CPU Usage
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Box sx={{ flexGrow: 1, mr: 1 }}>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={systemStats ? systemStats.cpuUsage : 0}
                                                    sx={{ height: 8, borderRadius: 5 }}
                                                />
                                            </Box>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats ? `${systemStats.cpuUsage}%` : 'Unknown'}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    <Stack spacing={1} sx={{ mt: 3 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">Uptime</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats ? formatUptime(systemStats.uptime) : 'Unknown'}
                                            </Typography>
                                        </Box>
                                        <Divider />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">Active Connections</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats ? systemStats.activeConnections : 'Unknown'}
                                            </Typography>
                                        </Box>
                                        <Divider />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">Last Restart</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats ? formatDate(systemStats.lastRestart) : 'Unknown'}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Grid>

                                <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Application Information
                                    </Typography>

                                    <Box sx={{ mb: 3 }}>
                                        <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', mb: 2 }}>
                                            <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                                                <MemoryIcon />
                                            </Avatar>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary">
                                                    Node.js Version
                                                </Typography>
                                                <Typography variant="body1">
                                                    v16.14.2
                                                </Typography>
                                            </Box>
                                        </Card>

                                        <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', mb: 2 }}>
                                            <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                                                <CodeIcon />
                                            </Avatar>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary">
                                                    Application Version
                                                </Typography>
                                                <Typography variant="body1">
                                                    v1.5.0
                                                </Typography>
                                            </Box>
                                        </Card>

                                        <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
                                            <Avatar sx={{ bgcolor: 'error.main', mr: 2 }}>
                                                <DnsIcon />
                                            </Avatar>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary">
                                                    OPC UA Library
                                                </Typography>
                                                <Typography variant="body1">
                                                    node-opcua v2.58.3
                                                </Typography>
                                            </Box>
                                        </Card>
                                    </Box>

                                    <Button
                                        variant="outlined"
                                        color="primary"
                                        startIcon={<RefreshIcon />}
                                        onClick={fetchSystemStats}
                                        fullWidth
                                    >
                                        Refresh System Info
                                    </Button>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </TabPanel>
            </Paper>

            {/* Loading overlay */}
            <Backdrop
                sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                open={loading && tabValue !== 0} // Only show for non-connection tabs
            >
                <CircularProgress color="inherit" />
            </Backdrop>
        </Box>
    );
};

export default SettingsPage;