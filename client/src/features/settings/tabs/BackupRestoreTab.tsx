import React from 'react';
import { Typography, Card, CardHeader, CardContent, Divider, Avatar, Alert } from '@mui/material';
import Grid from '@mui/material/Grid';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { ButtonLoader } from '@/shared/components/loading/index';
import { useBackupRestore } from '../hooks/useBackupRestore';
import ConfigurationBundlePanel from './ConfigurationBundlePanel';
import { useAuthStore } from '@/stores/useAuthStore';

const BackupRestoreTab: React.FC = () => {
  const admin = useAuthStore((s) => s.user?.role === 'admin');
  const { loading, fileInputRef, handleExportDashboards, handleFileSelected, handleImportClick } =
    useBackupRestore();

  return (
    <Card>
      <CardHeader
        title="Configuration Export & Import"
        avatar={
          <Avatar>
            <SettingsBackupRestoreIcon />
          </Avatar>
        }
        subheader="Setup bundles and local layouts. Full recovery also requires the database, measurements, certificates, reports and secret key; use the operations backup tool."
      />
      <Divider />
      <CardContent>
        {admin && (
          <>
            <ConfigurationBundlePanel />
            <Divider sx={{ my: 3 }} />
          </>
        )}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {' '}
                  Export Dashboards{' '}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    marginBottom: '16px',
                  }}
                >
                  Download a configuration file containing your dashboards, widgets, and layouts
                </Typography>
                <ButtonLoader
                  variant="contained"
                  color="primary"
                  startIcon={<CloudDownloadIcon />}
                  onClick={handleExportDashboards}
                  loading={loading}
                >
                  Export
                </ButtonLoader>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {' '}
                  Import Dashboards{' '}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    marginBottom: '16px',
                  }}
                >
                  Restore dashboards from a previously exported backup file
                </Typography>
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={handleFileSelected}
                  ref={fileInputRef}
                />
                <ButtonLoader
                  variant="contained"
                  color="secondary"
                  startIcon={<CloudUploadIcon />}
                  onClick={handleImportClick}
                  loading={loading}
                >
                  Import
                </ButtonLoader>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Alert severity="info">
              Note: Importing dashboards will override your current dashboard configuration. Make
              sure to export a backup of your current setup first if needed.
            </Alert>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default BackupRestoreTab;
