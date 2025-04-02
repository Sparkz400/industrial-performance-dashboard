import React, { useState } from 'react';
import {
    Typography,
    Box,
    Paper,
    Tab,
    Tabs,
    Tooltip,
    IconButton,
    CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import RefreshIcon from '@mui/icons-material/Refresh';
import LanguageIcon from '@mui/icons-material/Language';
import PaletteIcon from '@mui/icons-material/Palette';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import InfoIcon from '@mui/icons-material/Info';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';

// Import custom components
import TabPanel from '../ui/TabPanel';
import StatusIndicator from '../ui/StatusIndicator';
import LoadingBackdrop from '../components/LoadingBackdrop';

// Import tab components
import ConnectionsTab from '../tabs/ConnectionTab';
import AppearanceTab from '../tabs/AppearanceTab';
import CertificatesTab from '../components/CertificateManagement';
import BackupRestoreTab from '../tabs/BackupRestoreTab';
import SystemInfoTab from '../tabs/SystemInfoTab';

// Import hooks
import { useSystemStatus } from '../../system/index';
import { useOpcUaConnection } from '../hooks/useOpcUaConnection';
import { useDatabaseConnection } from '../hooks/useDatabaseConnection';
import { useSnackbar } from 'notistack';

// Main settings page component
const SettingsPage = () => {
    // Tab state
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(false);
    const { enqueueSnackbar } = useSnackbar();

    const { status, refreshStatus, lastChecked } = useSystemStatus();
    const { opcuaConnected, connectedAddress, securityMode, securityPolicy, fetchConnectionStatus } = useOpcUaConnection();
    const { dbOnline, dbHost, dbPort } = useDatabaseConnection();

    // Handle tab change
    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    // Format date for display
    const formatDate = (date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString();
    };

    // Handle refresh status
    const handleRefreshStatus = async () => {
        setLoading(true);
        try {
            await refreshStatus();
            await fetchConnectionStatus();
            // Add success notification
            enqueueSnackbar('System status refreshed', { variant: 'info', autoHideDuration: 2000 });
        } catch (error) {
            console.error("Error refreshing status:", error);
            // Add error notification
            enqueueSnackbar(`Failed to refresh status: ${error.message}`, { variant: 'error' });
        } finally {
            setLoading(false);
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

            {/* Status overview */}
            <Typography variant="h6" gutterBottom>
                System Status
                <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 2 }}>
                    Last updated: {formatDate(lastChecked)}
                </Typography>
            </Typography>

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <StatusIndicator
                        status={status?.database?.statusText || status?.database || 'Unknown'}
                        label="Database Connection"
                        description={dbOnline ? `Connected to ${dbHost}:${dbPort}` : 'Not connected'}
                        icon={<StorageIcon />}
                        loading={loading}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <StatusIndicator
                        status={status?.opcua?.statusText || status?.opcua || 'Unknown'}
                        label="OPC UA Connection"
                        description={opcuaConnected ?
                            `Connected to ${connectedAddress} (${securityMode}/${securityPolicy})` :
                            'Not connected'}
                        icon={<DnsIcon />}
                        loading={loading}
                    />
                </Grid>
            </Grid>

            {/* Tab setup */}
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
                    <Tab label="Certificates" id="settings-tab-2" icon={<SecurityIcon />} iconPosition="start" />
                    <Tab label="Backup & Restore" id="settings-tab-3" icon={<SettingsBackupRestoreIcon />} iconPosition="start" />
                    <Tab label="System Info" id="settings-tab-4" icon={<InfoIcon />} iconPosition="start" />
                </Tabs>

                <TabPanel value={tabValue} index={0} sx={{ flexGrow: 1 }}>
                    <ConnectionsTab />
                </TabPanel>

                <TabPanel value={tabValue} index={1} sx={{ flexGrow: 1 }}>
                    <AppearanceTab />
                </TabPanel>

                <TabPanel value={tabValue} index={2} sx={{ flexGrow: 1 }}>
                    <CertificatesTab />
                </TabPanel>

                <TabPanel value={tabValue} index={3}>
                    <BackupRestoreTab />
                </TabPanel>

                <TabPanel value={tabValue} index={4}>
                    <SystemInfoTab />
                </TabPanel>
            </Paper>

            {/* Loading overlay */}
            <LoadingBackdrop open={loading && tabValue !== 0} />
        </Box>
    );
};

export default SettingsPage;