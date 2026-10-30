import { useT } from '@/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Box, Paper, Tooltip, IconButton, CircularProgress } from '@mui/material';
import Grid from '@mui/material/Grid';
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
import SectionNavigation from '@/shared/components/SectionNavigation';
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
              label: 'Edges',
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
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 2 }}>
        {t('Settings')}
        <Tooltip title={t('Refresh Status')}>
          <span>
            <IconButton
              aria-label={t('Refresh Status')}
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
        <Typography
          variant="body2"
          component="span"
          sx={{
            color: 'text.secondary',
            ml: 2,
          }}
        >
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
            description={t(
              'Application database observation',
              'Beobachtung der Anwendungsdatenbank',
            )}
            icon={<StorageIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatusIndicator
            status={status?.opcua?.statusText || (status?.opcua as unknown as string) || 'Unknown'}
            label={t('OPC UA gateway', 'OPC-UA-Gateway')}
            description={t(
              'Legacy OPC UA gateway observation; machine connections are managed under Machines.',
              'Beobachtung des OPC-UA-Gateways; Maschinenverbindungen werden unter Maschinen verwaltet.',
            )}
            icon={<DnsIcon />}
            loading={loading}
          />
        </Grid>
      </Grid>

      <Paper
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          p: 2,
        }}
      >
        <SectionNavigation
          vertical
          label={t('Settings section', 'Einstellungsbereich')}
          value={tabValue}
          onChange={setTabValue}
          sections={tabs.map((tab, index) => ({ label: t(tab.label), value: index }))}
        />
        <Box
          role="region"
          aria-label={t(tabs.at(tabValue)?.label ?? 'Settings')}
          sx={{ minWidth: 0, flex: 1 }}
        >
          {tabs.at(tabValue)?.content}
        </Box>
      </Paper>

      {/* Loading overlay */}
      <LoadingBackdrop open={loading && tabValue !== 0} />
    </Box>
  );
};

export default SettingsPage;
