import React, {useState, useEffect, useCallback} from 'react';
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
    CircularProgress, AccordionDetails, AccordionSummary, Accordion
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import Grid from '@mui/material/Grid2';
import RefreshIcon from '@mui/icons-material/Refresh';
import LanguageIcon from '@mui/icons-material/Language';
import StorageIcon from '@mui/icons-material/Storage';
import DnsIcon from '@mui/icons-material/Dns';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import PaletteIcon from '@mui/icons-material/Palette';
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
import ThemePreview from '../components/ThemePreview';
import { useTheme } from '../contexts/ThemeContext';
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ThemeSelector from '../contexts/ThemeContext';

// Panel to display with each tab
function TabPanel(props) {
    const { children, value, index, sx, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`settings-tabpanel-${index}`}
            aria-labelledby={`settings-tab-${index}`}
            style={{ width: '100%', padding: '16px' }}
            {...other}
        >
            {value === index && (
                <Box sx={{ ...sx }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

// Status indicator component
const StatusIndicator = ({ status, label, description, icon, loading = false }) => {
    // Use MUI theme properly
    const theme = useMuiTheme();

    // Determine color based on status
    const getStatusColor = () => {
        if (loading) return theme?.palette?.info?.main || '#2196f3';

        switch(status?.toLowerCase()) {
            case 'connected':
            case 'online':
            case 'ok':
                return theme?.palette?.success?.main || '#4caf50';
            case 'warning':
            case 'degraded':
                return theme?.palette?.warning?.main || '#ff9800';
            case 'error':
            case 'offline':
            case 'disconnected':
                return theme?.palette?.error?.main || '#f44336';
            default:
                // Safely provide a fallback if theme is not available
                return theme?.palette?.text?.disabled || '#757575';
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
                        color={loading ? 'info' :
                            status?.toLowerCase() === 'connected' || status?.toLowerCase() === 'online' || status?.toLowerCase() === 'ok' ? 'success' :
                                status?.toLowerCase() === 'warning' || status?.toLowerCase() === 'degraded' ? 'warning' :
                                    status?.toLowerCase() === 'error' || status?.toLowerCase() === 'offline' || status?.toLowerCase() === 'disconnected' ? 'error' :
                                        'default'}
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
    const [error, setError] = useState(null);
    const [lastStatsUpdate, setLastStatsUpdate] = useState(null);
    const [connectionStats, setConnectionStats] = useState(null);
    const [loadingConnections, setLoadingConnections] = useState(false);

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
    const { themeMode, useSystemTheme, setThemeMode, setUseSystemTheme } = useTheme();

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
        await fetchConnectionStatus();
        setLoading(false);
    };

    // Fetch system stats
    const fetchSystemStats = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(API_ENDPOINTS.system.stats);

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            setSystemStats(data);

            // Update last fetch time
            setLastStatsUpdate(new Date());
        } catch (err) {
            console.error('Error fetching system stats:', err);
            setError(`Failed to fetch system statistics: ${err.message}`);

            // Fallback to mock data in case of errors
            setSystemStats({
                uptime: Math.floor(Math.random() * 1000000),
                memoryUsage: {
                    total: 8192,
                    used: Math.floor(Math.random() * 4000 + 2000),
                    percentUsed: Math.floor(Math.random() * 70 + 10)
                },
                cpuUsage: Math.floor(Math.random() * 70 + 10),
                activeConnections: Math.floor(Math.random() * 10 + 1),
                lastRestart: new Date(Date.now() - Math.random() * 86400000 * 10).toISOString(),
                isMockData: true
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Initial fetch
        void fetchSystemStats();

        // Set up auto-refresh interval (every 30 seconds)
        const refreshInterval = setInterval(() => {
            void fetchSystemStats();
        }, 30000);

        // Clean up
        return () => clearInterval(refreshInterval);
    }, [fetchSystemStats]);

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
        if (!seconds && seconds !== 0) return 'Unknown';

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        // Only show non-zero units
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

        return parts.join(' ');
    };

    // Load data on component mount
    useEffect(() => {
        void fetchConnectionStatus();
        void fetchSystemStats();
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

    // Add a function to fetch connection stats
    const fetchConnectionStats = useCallback(async () => {
        setLoadingConnections(true);
        try {
            const response = await fetch(API_ENDPOINTS.system.connections);

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            setConnectionStats(data);
        } catch (err) {
            console.error('Error fetching connection stats:', err);
            // Fallback to mock data
            setConnectionStats({
                activeCount: Math.floor(Math.random() * 10 + 1),
                activeConnections: Array.from({ length: 3 }, (_, i) => ({
                    id: `mock-connection-${i}`,
                    connectedAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
                    ip: '127.0.0.1',
                    userAgent: 'Mock Browser'
                })),
                history: Array.from({ length: 10 }, (_, i) => ({
                    type: i % 3 === 0 ? 'disconnect' : 'connect',
                    timestamp: new Date(Date.now() - i * 300000).toISOString(),
                    id: `mock-connection-${i % 5}`,
                    duration: i % 3 === 0 ? Math.floor(Math.random() * 500000) : null
                }))
            });
        } finally {
            setLoadingConnections(false);
        }
    }, []);

    // Call the function on component mount and set up auto-refresh
    useEffect(() => {
        void fetchConnectionStats();

        const interval = setInterval(() => {
            void fetchConnectionStats();
        }, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, [fetchConnectionStats]);

    const formatDuration = (ms) => {
        if (!ms) return 'Unknown';

        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    return (
        <Box sx={{
            p: { xs: 2, md: 3 },
            maxWidth: 1400,
            mx: 'auto',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Typography variant="h4" gutterBottom sx={{ mb: 2 }}>
                Settings
                <Tooltip title="Refresh Status">
            <span>
                <IconButton
                    onClick={handleRefreshStatus}
                    size="small"
                    sx={{ ml: 2 }}
                    disabled={loading}
                >
                    {loading ? <CircularProgress size={24} /> : <RefreshIcon />}
                </IconButton>
            </span>
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

            {/* Status overview in a compact, space-efficient layout */}
            <Typography variant="h6" gutterBottom>
                System Status
                <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 2 }}>
                    Last updated: {formatDate(lastChecked)}
                </Typography>
            </Typography>

            <Grid container spacing={2} sx={{ mb: 2 }}>
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

            {/* More compact tabs with better use of space */}
            <Paper sx={{ width: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    variant="scrollable"
                    scrollButtons="auto"
                    aria-label="settings tabs"
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab label="Connections" id="settings-tab-0" icon={<LanguageIcon />} iconPosition="start" />
                    <Tab label="Appearance" id="settings-tab-1" icon={<PaletteIcon />} iconPosition="start" />
                    <Tab label="Backup & Restore" id="settings-tab-2" icon={<SettingsBackupRestoreIcon />} iconPosition="start" />
                    <Tab label="System Info" id="settings-tab-3" icon={<InfoIcon />} iconPosition="start" />
                </Tabs>

                <TabPanel value={tabValue} index={0} sx={{ flexGrow: 1 }}>
                    <Grid container spacing={2}>
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
                                    sx={{ pb: 1 }}
                                />
                                <Divider />
                                <CardContent sx={{ pt: 2 }}>
                                    {/* More compact form with less spacing */}
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="IP Address"
                                                variant="outlined"
                                                fullWidth
                                                size="small"
                                                value={ip}
                                                onChange={(e) => setIp(e.target.value)}
                                                disabled={opcuaConnected}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Port"
                                                variant="outlined"
                                                fullWidth
                                                size="small"
                                                value={port}
                                                onChange={(e) => setPort(e.target.value)}
                                                disabled={opcuaConnected}
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <TextField
                                                label="Resource Path"
                                                variant="outlined"
                                                fullWidth
                                                size="small"
                                                value={resourcePath}
                                                onChange={(e) => setResourcePath(e.target.value)}
                                                disabled={opcuaConnected}
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
                                                        size="small"
                                                    >
                                                        Connect
                                                    </Button>
                                                    <Button
                                                        variant="outlined"
                                                        color="secondary"
                                                        onClick={handleDisconnect}
                                                        disabled={!opcuaConnected || loading}
                                                        startIcon={<StopCircleIcon />}
                                                        size="small"
                                                    >
                                                        Disconnect
                                                    </Button>
                                                </Box>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Database Connection Settings - more compact */}
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
                                    sx={{ pb: 1 }}
                                />
                                <Divider />
                                <CardContent sx={{ pt: 2 }}>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Host"
                                                variant="outlined"
                                                fullWidth
                                                size="small"
                                                value={dbHost}
                                                disabled
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Port"
                                                variant="outlined"
                                                fullWidth
                                                size="small"
                                                value={dbPort}
                                                disabled
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="User"
                                                variant="outlined"
                                                fullWidth
                                                size="small"
                                                value={dbUser}
                                                disabled
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Database"
                                                variant="outlined"
                                                fullWidth
                                                size="small"
                                                value={dbName}
                                                disabled
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                onClick={handleTestDbConnection}
                                                disabled={loading}
                                                startIcon={<CachedIcon />}
                                                size="small"
                                            >
                                                Test Connection
                                            </Button>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Connection History in a more compact collapsible format */}
                        <Grid item xs={12}>
                            <Accordion>
                                <AccordionSummary
                                    expandIcon={<ExpandMoreIcon />}
                                    aria-controls="connection-history-content"
                                    id="connection-history-header"
                                >
                                    <Typography variant="subtitle1">Connection History</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    {connectionHistory.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary" align="center">
                                            No connection history available
                                        </Typography>
                                    ) : (
                                        <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
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
                                </AccordionDetails>
                            </Accordion>
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Appearance tab with more efficient layout */}
                <TabPanel value={tabValue} index={1} sx={{ flexGrow: 1 }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardHeader
                                    title="Theme Settings"
                                    avatar={<Avatar><PaletteIcon /></Avatar>}
                                    subheader={`Current theme: ${useSystemTheme ? 'System' : themeMode}`}
                                    sx={{ pb: 1 }}
                                />
                                <Divider />
                                <CardContent sx={{ pt: 2 }}>
                                    {/* Use the ThemeSelector component */}
                                    <ThemeSelector
                                        themeMode={themeMode}
                                        useSystemTheme={useSystemTheme}
                                        onSelectLight={() => {
                                            setThemeMode('light');
                                            setUseSystemTheme(false);
                                            void showNotification('Light theme applied', 'success');
                                        }}
                                        onSelectDark={() => {
                                            setThemeMode('dark');
                                            setUseSystemTheme(false);
                                            void showNotification('Dark theme applied', 'success');
                                        }}
                                        onSelectSystem={() => {
                                            setUseSystemTheme(!useSystemTheme);
                                            void showNotification(
                                                useSystemTheme ? 'System theme preference disabled' : 'System theme preference enabled',
                                                'success'
                                            );
                                        }}
                                    />

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

                                    {useSystemTheme && (
                                        <Alert severity="info" sx={{ mt: 2 }}>
                                            Current system preference: <strong>{window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light'}</strong>
                                        </Alert>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardHeader
                                    title="Interface Settings"
                                    avatar={<Avatar><BrowserUpdatedIcon /></Avatar>}
                                    sx={{ pb: 1 }}
                                />
                                <Divider />
                                <CardContent sx={{ pt: 2 }}>
                                    <Grid container spacing={1}>
                                        <Grid item xs={12} sm={6}>
                                            <FormControlLabel
                                                control={<Switch defaultChecked color="primary" />}
                                                label="Show tooltips"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <FormControlLabel
                                                control={<Switch defaultChecked color="primary" />}
                                                label="Animated transitions"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <FormControlLabel
                                                control={<Switch defaultChecked color="primary" />}
                                                label="Sidebar auto-collapse"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <FormControlLabel
                                                control={<Switch color="primary" />}
                                                label="Compact mode"
                                            />
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>

                            {/* Collapsible theme preview */}
                            <Accordion sx={{ mt: 2 }}>
                                <AccordionSummary
                                    expandIcon={<ExpandMoreIcon />}
                                    aria-controls="theme-preview-content"
                                    id="theme-preview-header"
                                >
                                    <Typography variant="subtitle1">Theme Preview</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <ThemePreview mode={themeMode} />
                                </AccordionDetails>
                            </Accordion>
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
                                                    value={systemStats?.memoryUsage?.percentUsed || 0}
                                                    sx={{ height: 8, borderRadius: 5 }}
                                                />
                                            </Box>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats?.memoryUsage ?
                                                    `${systemStats.memoryUsage.used} MB / ${systemStats.memoryUsage.total} MB` :
                                                    'Unknown'}
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
                                                    value={systemStats?.cpuUsage || 0}
                                                    sx={{ height: 8, borderRadius: 5 }}
                                                />
                                            </Box>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats?.cpuUsage ? `${systemStats.cpuUsage}%` : 'Unknown'}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    <Stack spacing={1} sx={{ mt: 3 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">Uptime</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats?.uptime !== undefined ? formatUptime(systemStats.uptime) : 'Unknown'}
                                            </Typography>
                                        </Box>
                                        <Divider />

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">CPU Cores</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats?.cpuInfo?.cores || 'Unknown'}
                                            </Typography>
                                        </Box>
                                        <Divider />

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">Active Connections</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats?.activeConnections !== undefined ? systemStats.activeConnections : 'Unknown'}
                                            </Typography>
                                        </Box>
                                        <Divider />

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">Last Restart</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {systemStats?.lastRestart ? new Date(systemStats.lastRestart).toLocaleString() : 'Unknown'}
                                            </Typography>
                                        </Box>
                                    </Stack>

                                    {error && (
                                        <Alert severity="warning" sx={{ mt: 2 }}>
                                            {error}
                                        </Alert>
                                    )}

                                    {lastStatsUpdate && (
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                                            {systemStats?.isMockData ?
                                                'Using mock data (server unavailable)' :
                                                `Last updated: ${lastStatsUpdate.toLocaleString()}`}
                                        </Typography>
                                    )}

                                    <Box sx={{ mt: 2 }}>
                                        <Button
                                            variant="outlined"
                                            color="primary"
                                            startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                                            onClick={fetchSystemStats}
                                            disabled={loading}
                                            fullWidth
                                        >
                                            Refresh System Info
                                        </Button>
                                    </Box>
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
                                                    {systemStats?.platform?.release || 'v16.14.2'}
                                                </Typography>
                                            </Box>
                                        </Card>

                                        <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', mb: 2 }}>
                                            <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                                                <CodeIcon />
                                            </Avatar>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary">
                                                    Platform
                                                </Typography>
                                                <Typography variant="body1">
                                                    {systemStats?.platform ? `${systemStats.platform.type} (${systemStats.platform.platform})` : 'Unknown'}
                                                </Typography>
                                            </Box>
                                        </Card>

                                        <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
                                            <Avatar sx={{ bgcolor: 'error.main', mr: 2 }}>
                                                <DnsIcon />
                                            </Avatar>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary">
                                                    Process Memory
                                                </Typography>
                                                <Typography variant="body1">
                                                    {systemStats?.processMemory ?
                                                        `Heap: ${systemStats.processMemory.heapUsed} MB / ${systemStats.processMemory.heapTotal} MB` :
                                                        'Unknown'}
                                                </Typography>
                                            </Box>
                                        </Card>
                                    </Box>
                                </Grid>

                                <Grid item xs={12}>
                                    <Card>
                                        <CardHeader
                                            title="Connection Statistics"
                                            subheader={`${connectionStats?.activeCount || 0} active connections`}
                                            action={
                                                <Tooltip title="Refresh Connection Stats">
                    <span>
                        <IconButton
                            onClick={fetchConnectionStats}
                            disabled={loadingConnections}
                        >
                            {loadingConnections ? <CircularProgress size={20} /> : <RefreshIcon />}
                        </IconButton>
                    </span>
                                                </Tooltip>
                                            }
                                        />
                                        <Divider />
                                        <CardContent>
                                            <Typography variant="subtitle1" gutterBottom>
                                                Active Connections
                                            </Typography>

                                            {connectionStats?.activeConnections?.length > 0 ? (
                                                <Box sx={{ mt: 2, maxHeight: 200, overflow: 'auto' }}>
                                                    {connectionStats.activeConnections.map(client => (
                                                        <Box
                                                            key={client.id}
                                                            sx={{
                                                                p: 1,
                                                                mb: 1,
                                                                borderRadius: 1,
                                                                bgcolor: 'background.paper',
                                                                boxShadow: 1
                                                            }}
                                                        >
                                                            <Typography variant="body2" component="div">
                                                                <strong>ID:</strong> {client.id.substring(0, 8)}...
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Connected:</strong> {new Date(client.connectedAt).toLocaleString()}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {client.ip} | {client.userAgent?.substring(0, 50)}...
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </Box>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                                                    No active connections
                                                </Typography>
                                            )}

                                            <Divider sx={{ my: 3 }} />

                                            <Typography variant="subtitle1" gutterBottom>
                                                Connection History
                                            </Typography>

                                            {connectionStats?.history?.length > 0 ? (
                                                <Box sx={{ mt: 2, maxHeight: 300, overflow: 'auto' }}>
                                                    {connectionStats.history.map((entry, index) => (
                                                        <Box
                                                            key={index}
                                                            sx={{
                                                                p: 1,
                                                                mb: 1,
                                                                borderRadius: 1,
                                                                bgcolor: entry.type === 'connect' ? 'success.main' : 'error.main',
                                                                color: 'white',
                                                                opacity: 0.8
                                                            }}
                                                        >
                                                            <Typography variant="body2" component="div">
                                                                <strong>{entry.type === 'connect' ? 'Connected' : 'Disconnected'}</strong>
                                                            </Typography>
                                                            <Typography variant="body2">
                                                                {new Date(entry.timestamp).toLocaleString()}
                                                            </Typography>
                                                            <Typography variant="caption">
                                                                ID: {entry.id.substring(0, 8)}...
                                                                {entry.duration && ` | Duration: ${formatDuration(entry.duration)}`}
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </Box>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                                                    No connection history
                                                </Typography>
                                            )}
                                        </CardContent>
                                    </Card>
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