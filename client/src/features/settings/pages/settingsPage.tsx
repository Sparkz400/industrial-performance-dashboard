import { useT } from '@/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Box,
  Paper,
  Tab,
  Tabs,
  Tooltip,
  IconButton,
  CircularProgress,
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
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import WebhookIcon from '@mui/icons-material/Webhook';
import ExtensionIcon from '@mui/icons-material/Extension';

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
import AuditTrailTab from '../tabs/AuditTrailTab';
import AccessTab from '../tabs/AccessTab';
import WebhookManager from '../../webhooks/components/WebhookManager';
import CustomWidgetManager from '../../widgets/sdk/CustomWidgetManager';
import EdgeSettingsPanel from '../../edge/components/EdgeSettingsPanel';

// Import hooks
import { useStatusStore } from '@/stores/useStatusStore';
import { useOpcUaConnection } from '../hooks/useOpcUaConnection';
import { useDatabaseConnection } from '../hooks/useDatabaseConnection';
import { useSnackbar } from 'notistack';
import { useAuthStore } from '@/stores/useAuthStore';

// Main settings page component
const SettingsPage: React.FC = () => {
  const t = useT();

  // Tab state
  const [tabValue, setTabValue] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const { enqueueSnackbar } = useSnackbar();
  const user = useAuthStore((s) => s.user);

  const status = useStatusStore((s) => s.status);
  const refreshStatus = useStatusStore((s) => s.refreshStatus);
  const lastChecked = useStatusStore((s) => s.lastChecked);
  const { opcuaConnected, connectedAddress, securityMode, securityPolicy, fetchConnectionStatus } =
    useOpcUaConnection();
  const { dbOnline, dbHost, dbPort } = useDatabaseConnection();

  const tabs = useMemo(
    () => [
      {
        label: 'Connections',
        icon: <LanguageIcon />,
        content: <ConnectionsTab />,
      },
      {
        label: 'Appearance',
        icon: <PaletteIcon />,
        content: <AppearanceTab />,
      },
      {
        label: 'Backup & Restore',
        icon: <SettingsBackupRestoreIcon />,
        content: <BackupRestoreTab />,
      },
      ...(user?.role === 'admin'
        ? [
            { label: 'People & Access', icon: <SecurityIcon />, content: <AccessTab /> },
            {
              label: 'Certificates',
              icon: <SecurityIcon />,
              content: <CertificatesTab />,
            },
            {
              label: 'Audit Trail',
              icon: <HistoryEduIcon />,
              content: <AuditTrailTab />,
            },
            {
              label: 'Webhooks',
              icon: <WebhookIcon />,
              content: <WebhookManager />,
            },
            {
              label: 'Edge Status',
              icon: <StorageIcon />,
              content: <EdgeSettingsPanel />,
            },
            {
              label: 'Custom Widgets',
              icon: <ExtensionIcon />,
              content: <CustomWidgetManager />,
            },
          ]
        : []),
      {
        label: 'System Info',
        icon: <InfoIcon />,
        content: <SystemInfoTab />,
      },
    ],
    [user?.role],
  );

  useEffect(() => {
    if (tabValue >= tabs.length) {
      setTabValue(0);
    }
  }, [tabValue, tabs.length]);

  // Handle tab change
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number): void => {
    setTabValue(newValue);
  };

  // Format date for display
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  // Handle refresh status
  const handleRefreshStatus = async (): Promise<void> => {
    setLoading(true);
    try {
      await refreshStatus();
      await fetchConnectionStatus();
      // Add success notification
      enqueueSnackbar('System status refreshed', { variant: 'info', autoHideDuration: 2000 });
    } catch (error) {
      console.error('Error refreshing status:', error);
      // Add error notification
      enqueueSnackbar(`Failed to refresh status: ${(error as Error).message}`, {
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        p: { xs: 2, md: 3 },
        maxWidth: 1400,
        width: '100%',
        minWidth: 0,
        mx: 'auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography variant="h4" gutterBottom sx={{ mb: 2 }}>
        {t('Settings')}
        <Tooltip title={t('Refresh Status')}>
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
        {t('System Status')}
        <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 2 }}>
          {t('Last updated:')} {formatDate(lastChecked)}
        </Typography>
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatusIndicator
            status={
              status?.database?.statusText || (status?.database as unknown as string) || 'Unknown'
            }
            label={t('Database Connection')}
            description={dbOnline ? `Connected to ${dbHost}:${dbPort}` : 'Not connected'}
            icon={<StorageIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatusIndicator
            status={status?.opcua?.statusText || (status?.opcua as unknown as string) || 'Unknown'}
            label={t('OPC UA Connection')}
            description={
              opcuaConnected
                ? `Connected to ${connectedAddress} (${securityMode}/${securityPolicy})`
                : 'Not connected'
            }
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
          aria-label={t('settings tabs')}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.label}
              label={t(tab.label)}
              id={`settings-tab-${index}`}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>

        {tabs.map((tab, index) => (
          <TabPanel key={tab.label} value={tabValue} index={index} sx={{ flexGrow: 1 }}>
            {tab.content}
          </TabPanel>
        ))}
      </Paper>

      {/* Loading overlay */}
      <LoadingBackdrop open={loading && tabValue !== 0} />
    </Box>
  );
};

export default SettingsPage;
