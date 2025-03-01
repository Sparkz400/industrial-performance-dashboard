import React, {useEffect, useState, Suspense, useMemo, useCallback, useRef} from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate
} from 'react-router-dom';
import {
    Box,
    CssBaseline,
    createTheme,
    ThemeProvider,
    CircularProgress,
    Typography,
    Button,
    alpha,
    useMediaQuery,
    Snackbar,
    Alert
} from '@mui/material';
import ResponsiveSidebar from './components/sidebar/sidebar.jsx';
import ErrorBoundary from './components/ErrorBoundary';
import { useSystemStatus } from './contexts/StatusContext.jsx';

// Lazy load pages with better naming
const DashboardPage = React.lazy(() => import('./pages/dashboardPage.jsx'));
const SettingsPage = React.lazy(() => import('./pages/settingsPage'));
const HelpPage = React.lazy(() => import('./pages/helpPage'));

// Loading component for Suspense fallback
const PageLoader = () => (
    <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
    }}>
        <CircularProgress size={40} sx={{ mb: 3 }} />
        <Typography variant="h6" color="textSecondary">
            Loading...
        </Typography>
    </Box>
);

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }) => (
    <Box
        sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            p: 3
        }}
    >
        <Typography variant="h4" color="error" gutterBottom>
            Something went wrong
        </Typography>
        <Typography variant="body1" paragraph align="center" sx={{ maxWidth: 500, mb: 3 }}>
            {error.message || "An unexpected error occurred. Please try refreshing the page."}
        </Typography>
        <Button
            variant="contained"
            color="primary"
            onClick={resetErrorBoundary}
        >
            Try Again
        </Button>
    </Box>
);

function App() {
    // Use media query to detect dark mode preference
    const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
    const [themeMode, setThemeMode] = useState(localStorage.getItem('themeMode') || 'dark');
    const [sidebarOpen, setSidebarOpen] = useState(
        localStorage.getItem('sidebarOpen') !== 'false' // Default to true if not set
    );
    const [drawerWidth, setDrawerWidth] = useState(0);
    const [notification, setNotification] = useState({open: false, message: '', severity: 'info'});

    // Get status from context
    const {status, isError} = useSystemStatus();

    // Set theme based on user preference or system preference
    useEffect(() => {
        const storedMode = localStorage.getItem('themeMode');
        if (!storedMode) {
            setThemeMode(prefersDarkMode ? 'dark' : 'light');
        }
    }, [prefersDarkMode]);

    // Persist sidebar state to localStorage
    useEffect(() => {
        localStorage.setItem('sidebarOpen', sidebarOpen.toString());
    }, [sidebarOpen]);

    // Theme creation with proper memoization
    const theme = useMemo(() => {
        // Common palette for both light and dark
        const commonPalette = {
            primary: {
                main: themeMode === 'dark' ? '#53b4f3' : '#1976d2',
            },
            secondary: {
                main: themeMode === 'dark' ? '#f45f7c' : '#dc004e',
            },
            error: {
                main: '#f44336',
            },
            warning: {
                main: '#ff9800',
            },
            info: {
                main: '#2196f3',
            },
            success: {
                main: '#4caf50',
            },
        };

        // Specific overrides for dark/light mode
        return createTheme({
            palette: {
                mode: themeMode,
                ...commonPalette,
                ...(themeMode === 'dark'
                    ? {
                        background: {
                            default: '#1e1f22',
                            paper: '#2b2d30',
                        },
                    }
                    : {
                        background: {
                            default: '#f5f5f5',
                            paper: '#ffffff',
                        },
                    }),
            },
            components: {
                MuiButton: {
                    styleOverrides: {
                        root: {
                            textTransform: 'none',
                        },
                    },
                },
                MuiDrawer: {
                    styleOverrides: {
                        paper: {
                            backgroundColor: themeMode === 'dark' ? '#2b2d30' : '#f5f5f5',
                            boxShadow: themeMode === 'dark'
                                ? '0px 3px 5px rgba(0,0,0,0.3)'
                                : '0px 3px 5px rgba(0,0,0,0.1)',
                        },
                    },
                },
                MuiCard: {
                    styleOverrides: {
                        root: {
                            backgroundColor: themeMode === 'dark' ? alpha('#2b2d30', 0.8) : '#ffffff',
                            transition: 'box-shadow 0.3s ease',
                            '&:hover': {
                                boxShadow: themeMode === 'dark'
                                    ? '0px 5px 15px rgba(0,0,0,0.3)'
                                    : '0px 5px 15px rgba(0,0,0,0.1)',
                            },
                        },
                    },
                },
            },
        });
    }, [themeMode]);

    // Function to toggle theme
    const toggleTheme = useCallback(() => {
        const newMode = themeMode === 'dark' ? 'light' : 'dark';
        setThemeMode(newMode);
        localStorage.setItem('themeMode', newMode);
    }, [themeMode]);

    // Check for system errors and show notifications
    useEffect(() => {
        if (isError) {
            setNotification({
                open: true,
                message: 'System connection issue detected',
                severity: 'error'
            });
        }
    }, [isError]);

    // Toggle sidebar
    const toggleSidebar = useCallback(() => {
        setSidebarOpen((prev) => !prev);
    }, []);

    // Content box styles
    const contentBoxStyles = useMemo(
        () => ({
            flexGrow: 1,
            ml: `${drawerWidth}px`,
            transition: 'margin-left 0.3s ease',
            overflow: 'hidden',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
        }),
        [drawerWidth]
    );

    // Handle notification close
    const handleCloseNotification = useCallback(() => {
        setNotification(prev => ({...prev, open: false}));
    }, []);

    return (
        <ThemeProvider theme={theme}>
            <Router>
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <Box sx={{display: 'flex', minHeight: '100vh'}}>
                        <CssBaseline/>

                        <ErrorBoundary FallbackComponent={ErrorFallback}>
                            <ResponsiveSidebar
                                open={sidebarOpen}
                                onToggle={toggleSidebar}
                                onWidthChange={setDrawerWidth}
                                themeMode={themeMode}
                                onToggleTheme={toggleTheme}
                                status={status}
                            />
                        </ErrorBoundary>

                        <Box component="main" sx={contentBoxStyles}>
                            <ErrorBoundary FallbackComponent={ErrorFallback}>
                                <Suspense fallback={<PageLoader/>}>
                                    <Routes>
                                        <Route path="/" element={<DashboardPage/>}/>
                                        <Route path="/settings" element={<SettingsPage/>}/>
                                        <Route path="/help" element={<HelpPage/>}/>
                                        <Route path="*" element={<Navigate to="/" replace/>}/>
                                    </Routes>
                                </Suspense>
                            </ErrorBoundary>
                        </Box>
                    </Box>
                </ErrorBoundary>

                {/* System status notification */}
                <Snackbar
                    open={notification.open}
                    autoHideDuration={notification.severity === 'error' ? null : 6000}
                    onClose={handleCloseNotification}
                    anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                >
                    <Alert
                        onClose={handleCloseNotification}
                        severity={notification.severity}
                        variant="filled"
                        sx={{width: '100%'}}
                    >
                        {notification.message}
                    </Alert>
                </Snackbar>
            </Router>
        </ThemeProvider>
    );
}

export default App;