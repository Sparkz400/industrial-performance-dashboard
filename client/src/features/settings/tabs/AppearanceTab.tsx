import React from 'react';
import {
  Typography,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Avatar,
  Alert,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import PaletteIcon from '@mui/icons-material/Palette';
import BrowserUpdatedIcon from '@mui/icons-material/BrowserUpdated';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useThemeStore } from '@/stores/useThemeStore';
import ThemePreview from '../../system/components/ThemePreview';
import { useSnackbar } from 'notistack';

const AppearanceTab: React.FC = () => {
  const themeMode = useThemeStore((s) => s.themeMode);
  const useSystemTheme = useThemeStore((s) => s.useSystemTheme);
  const setThemeMode = useThemeStore((s) => s.setThemeMode);
  const setUseSystemTheme = useThemeStore((s) => s.setUseSystemTheme);
  const { enqueueSnackbar } = useSnackbar();

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Card>
          <CardHeader
            title="Theme Settings"
            avatar={
              <Avatar>
                <PaletteIcon />
              </Avatar>
            }
            subheader={`Current theme: ${useSystemTheme ? 'System' : themeMode}`}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent sx={{ pt: 2 }}>
            <Grid container spacing={1} sx={{ mb: 2 }}>
              <Grid size={{ xs: 4 }}>
                <Card
                  variant="outlined"
                  onClick={() => {
                    setThemeMode('light');
                    enqueueSnackbar('Light theme applied', { variant: 'success' });
                  }}
                  sx={{
                    cursor: 'pointer',
                    p: 2,
                    textAlign: 'center',
                    border: themeMode === 'light' && !useSystemTheme ? 2 : 1,
                    borderColor:
                      themeMode === 'light' && !useSystemTheme ? 'primary.main' : 'divider',
                  }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={themeMode === 'light' && !useSystemTheme ? 'bold' : 'normal'}
                  >
                    Light
                  </Typography>
                </Card>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Card
                  variant="outlined"
                  onClick={() => {
                    setThemeMode('dark');
                    enqueueSnackbar('Dark theme applied', { variant: 'success' });
                  }}
                  sx={{
                    cursor: 'pointer',
                    p: 2,
                    textAlign: 'center',
                    border: themeMode === 'dark' && !useSystemTheme ? 2 : 1,
                    borderColor:
                      themeMode === 'dark' && !useSystemTheme ? 'primary.main' : 'divider',
                  }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={themeMode === 'dark' && !useSystemTheme ? 'bold' : 'normal'}
                  >
                    Dark
                  </Typography>
                </Card>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Card
                  variant="outlined"
                  onClick={() => {
                    setUseSystemTheme(true);
                    enqueueSnackbar('System theme applied — follows OS preference', {
                      variant: 'success',
                    });
                  }}
                  sx={{
                    cursor: 'pointer',
                    p: 2,
                    textAlign: 'center',
                    border: useSystemTheme ? 2 : 1,
                    borderColor: useSystemTheme ? 'primary.main' : 'divider',
                  }}
                >
                  <Typography variant="body2" fontWeight={useSystemTheme ? 'bold' : 'normal'}>
                    System
                  </Typography>
                </Card>
              </Grid>
            </Grid>

            {useSystemTheme && (
              <Alert severity="info" sx={{ mt: 1 }}>
                Following OS preference:{' '}
                <strong>
                  {window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light'}
                </strong>
              </Alert>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card>
          <CardHeader
            title="Interface Settings"
            avatar={
              <Avatar>
                <BrowserUpdatedIcon />
              </Avatar>
            }
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent sx={{ pt: 2 }}>
            <Grid container spacing={1}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControlLabel
                  control={<Switch defaultChecked color="primary" />}
                  label="Show tooltips"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControlLabel
                  control={<Switch defaultChecked color="primary" />}
                  label="Animated transitions"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControlLabel
                  control={<Switch defaultChecked color="primary" />}
                  label="Sidebar auto-collapse"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControlLabel control={<Switch color="primary" />} label="Compact mode" />
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
  );
};

export default AppearanceTab;
