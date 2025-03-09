import React, {useEffect, useState, Suspense, useMemo, useCallback} from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate
} from 'react-router-dom';
import {
    Box,
    CssBaseline,
    Typography,
    Button,
    Snackbar,
    Alert
} from '@mui/material';
import ResponsiveSidebar from './features/layout/components/sidebar.jsx';
import ErrorBoundary from './features/system/components/ErrorBoundary.jsx';
import { useSystemStatus } from './features/system/index.jsx';
import { useTheme } from './features/system/index.jsx';
import CertificateNotification from './features/settings/components/CertificateNotification.jsx';
import { FullPageLoader } from './shared/components/loading';
import { ButtonLoader } from './shared/components/loading';

// Lazy load pages with better naming
const DashboardPage = React.lazy(() => import('./features/dashboard/pages/dashboardPage.jsx'));
const SettingsPage = React.lazy(() => import('./features/settings/pages/settingsPage'));
const HelpPage = React.lazy(() => import('./features/help/pages/helpPage.jsx'));

// Loading component for Suspense fallback
const PageLoader = () => <FullPageLoader message="Loading page..." />;

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
        <ButtonLoader
            variant="contained"
            color="primary"
            onClick={resetErrorBoundary}
        >
            Try Again
        </ButtonLoader>
    </Box>
);

function App() {
    const { themeMode } = useTheme();
    const [sidebarOpen, setSidebarOpen] = useState(
        localStorage.getItem('sidebarOpen') !== 'false'
    );
    const [drawerWidth, setDrawerWidth] = useState(0);
    const [notification, setNotification] = useState({open: false, message: '', severity: 'info'});

    // Get status from context
    const {status, isError} = useSystemStatus();

    // Persist sidebar state to localStorage
    useEffect(() => {
        localStorage.setItem('sidebarOpen', sidebarOpen.toString());
    }, [sidebarOpen]);

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
        <Router>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <Box sx={{display: 'flex', minHeight: '100vh'}}>
                    <CssBaseline/>

                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <ResponsiveSidebar
                            open={sidebarOpen}
                            onToggle={toggleSidebar}
                            onWidthChange={setDrawerWidth}
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

            {/* Certificate Notifications */}
            <CertificateNotification />
        </Router>
    );
}

export default App;