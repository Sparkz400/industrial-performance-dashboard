import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  CardHeader,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  Stack,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  CircularProgress,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import SettingsIcon from '@mui/icons-material/Settings';
import DrawIcon from '@mui/icons-material/Draw';
import EditNoteIcon from '@mui/icons-material/EditNote';
import GavelIcon from '@mui/icons-material/Gavel';
import {
  useComplianceConfig,
  useUpdateComplianceConfig,
} from '../hooks/useComplianceQueries';

const ComplianceConfigTab: React.FC = () => {
  const { data: config, isLoading, isError, error } = useComplianceConfig();
  const updateConfig = useUpdateComplianceConfig();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load compliance configuration
        {error instanceof Error ? `: ${error.message}` : '.'}
      </Alert>
    );
  }

  return (
    <Grid container spacing={3}>
      {/* Section 1: Compliance Mode Status */}
      <Grid size={{ xs: 12 }}>
        <Card>
          <CardHeader
            avatar={<SettingsIcon color="primary" />}
            title="Compliance Mode Status"
            subheader={
              config?.complianceModeEnabled
                ? 'Compliance mode is currently active'
                : 'Compliance mode is currently inactive'
            }
          />
          <Divider />
          <CardContent>
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config?.complianceModeEnabled ?? false}
                    disabled
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography>Compliance Mode</Typography>
                    <Chip
                      label={config?.complianceModeEnabled ? 'Enabled' : 'Disabled'}
                      color={config?.complianceModeEnabled ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                }
              />
              <Alert severity="info">
                Compliance mode is configured via the{' '}
                <strong>COMPLIANCE_MODE_ENABLED</strong> environment variable. When
                enabled, critical actions are recorded with SHA-256 checksums,
                electronic signatures, and reason-for-change fields.
              </Alert>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      {/* Section 2: Actions Requiring Electronic Signature */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Card sx={{ height: '100%' }}>
          <CardHeader
            avatar={<DrawIcon color="primary" />}
            title="Actions Requiring Electronic Signature"
          />
          <Divider />
          <CardContent>
            <List dense>
              {config?.requireSignatureFor?.map((action) => (
                <ListItem key={action}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <DrawIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText primary={action} />
                </ListItem>
              ))}
              {(!config?.requireSignatureFor ||
                config.requireSignatureFor.length === 0) && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  No actions configured.
                </Typography>
              )}
            </List>
            <Alert severity="info" sx={{ mt: 2 }}>
              These actions require the user to re-enter their password to create an
              electronic signature (21 CFR Part 11).
            </Alert>
          </CardContent>
        </Card>
      </Grid>

      {/* Section 3: Actions Requiring Reason for Change */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Card sx={{ height: '100%' }}>
          <CardHeader
            avatar={<EditNoteIcon color="primary" />}
            title="Actions Requiring Reason for Change"
          />
          <Divider />
          <CardContent>
            <List dense>
              {config?.requireReasonFor?.map((action) => (
                <ListItem key={action}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <EditNoteIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText primary={action} />
                </ListItem>
              ))}
              {(!config?.requireReasonFor ||
                config.requireReasonFor.length === 0) && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  No actions configured.
                </Typography>
              )}
            </List>
            <Alert severity="info" sx={{ mt: 2 }}>
              These actions require the user to document why the change is being made.
            </Alert>
          </CardContent>
        </Card>
      </Grid>

      {/* Section 4: 21 CFR Part 11 Checklist */}
      <Grid size={{ xs: 12 }}>
        <Card>
          <CardHeader
            avatar={<GavelIcon color="primary" />}
            title="21 CFR Part 11 Checklist"
            subheader="Compliance feature status overview"
          />
          <Divider />
          <CardContent>
            <List>
              <ListItem>
                <ListItemText primary="SHA-256 audit trail checksums" />
                <Chip label="Enabled" color="success" size="small" />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText primary="Electronic signatures" />
                <Chip label="Enabled" color="success" size="small" />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText primary="Reason for change tracking" />
                <Chip label="Enabled" color="success" size="small" />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText primary="Before/after snapshots" />
                <Chip label="Enabled" color="success" size="small" />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText primary="Audit trail integrity verification" />
                <Chip label="Enabled" color="success" size="small" />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText primary="Audit trail export (CSV/JSON)" />
                <Chip label="Enabled" color="success" size="small" />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default ComplianceConfigTab;
