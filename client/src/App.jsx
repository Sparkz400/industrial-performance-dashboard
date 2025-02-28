import React, {useEffect, useState, Suspense, useMemo, useCallback, useContext, createContext, useRef} from 'react';
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
import { API_ENDPOINTS, POLLING_INTERVAL_MS } from './config/config';
import ErrorBoundary from './components/ErrorBoundary';

// Create a context for system status
const StatusContext = createContext({
    status: { database: 'unknown', opcua: 'unknown' },
    lastChecked: null,
    refreshStatus: () => {}
});

export const useSystemStatus = () => useContext(StatusContext);

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
    const [status, setStatus] = useState({ database: 'unknown', opcua: 'unknown' });
    const [lastChecked, setLastChecked] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(
        localStorage.getItem('sidebarOpen') !== 'false' // Default to true if not set
    );
    const [drawerWidth, setDrawerWidth] = useState(0);
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

    // Add this for API request handling
    const isStatusPolling = useRef(false);
    const statusTimeoutId = useRef(null);

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

    // Function to fetch the system status
    const fetchStatus = useCallback(async () => {
        // Prevent parallel requests
        if (isStatusPolling.current) {
            return;
        }

        isStatusPolling.current = true;

        try {
            const res = await fetch(API_ENDPOINTS.status);

            if (!res.ok) {
                if (res.status === 429) {
                    console.warn('Status API rate limited, will retry later');
                    // Don't update state on rate limit - keep previous values
                    return;
                }
                throw new Error('Failed to fetch status');
            }

            const data = await res.json();
            setStatus(data);
            setLastChecked(new Date());

            // Check if there was a previous error that's now resolved
            if (notification.open && notification.severity === 'error' &&
                (data.overall?.status === 'CONNECTED' ||
                    (data.database?.status === 'CONNECTED' && data.opcua?.status === 'CONNECTED'))) {
                setNotification({
                    open: true,
                    message: 'System connections restored',
                    severity: 'success'
                });
            }

            // Also check if we've moved from warning to error
            else if (data.overall?.status === 'ERROR') {
                const prevStatus = status?.overall?.status;
                if (prevStatus !== 'ERROR') {
                    setNotification({
                        open: true,
                        message: `System issue detected: ${data.overall.statusText}`,
                        severity: 'error'
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching status:', err);
            setNotification({
                open: true,
                message: 'Failed to connect to backend services',
                severity: 'error'
            });
        } finally {
            // Set a timeout before allowing another fetch
            if (statusTimeoutId.current) {
                clearTimeout(statusTimeoutId.current);
            }

            statusTimeoutId.current = setTimeout(() => {
                isStatusPolling.current = false;
            }, 2000); // 2-second cooldown
        }
    }, [notification, status]);

    // Setup status polling with a single interval
    useEffect(() => {
        // Initial fetch with a delay to avoid conflict with other initializations
        const initialFetchTimer = setTimeout(() => {
            fetchStatus();
        }, 1000);

        // Set up polling
        const pollingInterval = setInterval(fetchStatus, POLLING_INTERVAL_MS);

        return () => {
            clearTimeout(initialFetchTimer);
            clearInterval(pollingInterval);
            if (statusTimeoutId.current) {
                clearTimeout(statusTimeoutId.current);
            }
        };
    }, [fetchStatus]);

    // Status context value with memoization
    const statusContextValue = useMemo(() => ({
        status,
        lastChecked,
        refreshStatus: fetchStatus,
        isError: status?.overall?.status === 'ERROR',
        isConnected: status?.overall?.status === 'CONNECTED',
        statusText: status?.overall?.statusText || 'Unknown'
    }), [status, lastChecked, fetchStatus]);

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
        setNotification(prev => ({ ...prev, open: false }));
    }, []);

    return (
        <ThemeProvider theme={theme}>
            <StatusContext.Provider value={statusContextValue}>
                <Router>
                    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
                        <CssBaseline />

                        <ResponsiveSidebar
                            open={sidebarOpen}
                            onToggle={toggleSidebar}
                            onWidthChange={setDrawerWidth}
                            themeMode={themeMode}
                            onToggleTheme={toggleTheme}
                            status={status}
                        />

                        <Box component="main" sx={contentBoxStyles}>
                            <ErrorBoundary FallbackComponent={ErrorFallback}>
                                <Suspense fallback={<PageLoader />}>
                                    <Routes>
                                        <Route path="/" element={<DashboardPage />} />
                                        <Route path="/settings" element={<SettingsPage />} />
                                        <Route path="/help" element={<HelpPage />} />
                                        <Route path="*" element={<Navigate to="/" replace />} />
                                    </Routes>
                                </Suspense>
                            </ErrorBoundary>
                        </Box>
                    </Box>
                </Router>

                {/* System status notification */}
                <Snackbar
                    open={notification.open}
                    autoHideDuration={notification.severity === 'error' ? null : 6000}
                    onClose={handleCloseNotification}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                >
                    <Alert
                        onClose={handleCloseNotification}
                        severity={notification.severity}
                        variant="filled"
                        sx={{ width: '100%' }}
                    >
                        {notification.message}
                    </Alert>
                </Snackbar>
            </StatusContext.Provider>
        </ThemeProvider>
    );
}

export default App;