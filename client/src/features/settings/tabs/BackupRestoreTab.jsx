import React from 'react';
import {
    Typography,
    Card,
    CardHeader,
    CardContent,
    Divider,
    Button,
    Avatar,
    Alert
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useBackupRestore } from '../hooks/useBackupRestore';

const BackupRestoreTab = ({ setGlobalAlertInfo }) => {
    const {
        backupInProgress,
        alertInfo,
        setAlertInfo,
        fileInputRef,
        handleExportDashboards,
        handleFileSelected,
        handleImportClick
    } = useBackupRestore();

    // Forward alerts to the parent component
    React.useEffect(() => {
        if (alertInfo.open) {
            setGlobalAlertInfo(alertInfo);
        }
    }, [alertInfo, setGlobalAlertInfo]);

    return (
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
    );
};

export default BackupRestoreTab;