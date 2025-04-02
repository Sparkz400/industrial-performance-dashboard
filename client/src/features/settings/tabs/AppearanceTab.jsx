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
    AccordionDetails
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import PaletteIcon from '@mui/icons-material/Palette';
import BrowserUpdatedIcon from '@mui/icons-material/BrowserUpdated';
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTheme } from '../../system/index.jsx';
import ThemePreview from '../../system/components/ThemePreview';
import { ThemeProvider as ThemeSelector } from '../../system/contexts/ThemeContext';
import { useSnackbar } from 'notistack';

const AppearanceTab = ({}) => {
    const { themeMode, useSystemTheme, setThemeMode, setUseSystemTheme } = useTheme();
    const { enqueueSnackbar } = useSnackbar();

    return (
        <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
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
                                enqueueSnackbar('Light theme applied', { variant: 'success' });
                            }}
                            onSelectDark={() => {
                                setThemeMode('dark');
                                setUseSystemTheme(false);
                                enqueueSnackbar('Dark theme applied', { variant: 'success' });
                            }}
                            onSelectSystem={() => {
                                setUseSystemTheme(!useSystemTheme);
                                enqueueSnackbar(
                                    nextUseSystemTheme ? 'System theme preference enabled' : 'System theme preference disabled',
                                    { variant: 'success' }
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

            <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                    <CardHeader
                        title="Interface Settings"
                        avatar={<Avatar><BrowserUpdatedIcon /></Avatar>}
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
    );
};

export default AppearanceTab;