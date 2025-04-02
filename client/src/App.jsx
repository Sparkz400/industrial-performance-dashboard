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
    CircularProgress,
    Typography,
    Button
} from '@mui/material';
import ResponsiveSidebar from './features/layout/components/sidebar.jsx';
import ErrorBoundary from './features/system/components/ErrorBoundary.jsx';
import { useSystemStatus } from './features/system/index.jsx';
import CertificateNotification from './features/settings/components/CertificateNotification.jsx';
import CsrfErrorHandler from './shared/components/CsrfErrorHandler.jsx';
import { useSnackbar } from 'notistack';

// Lazy load pages with better naming
const DashboardPage = React.lazy(() => import('./features/dashboard/pages/dashboardPage.jsx'));
const SettingsPage = React.lazy(() => import('./features/settings/pages/settingsPage'));
const HelpPage = React.lazy(() => import('./features/help/pages/helpPage.jsx'));

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
    const [sidebarOpen, setSidebarOpen] = useState(
        localStorage.getItem('sidebarOpen') !== 'false'
    );
    const [drawerWidth, setDrawerWidth] = useState(0);

    // Get status from context
    const { status, isError } = useSystemStatus();
    const { enqueueSnackbar } = useSnackbar();

    // Persist sidebar state to localStorage
    useEffect(() => {
        localStorage.setItem('sidebarOpen', sidebarOpen.toString());
    }, [sidebarOpen]);

    // Check for system errors and show notifications
    useEffect(() => {
        if (isError) {
            // Use enqueueSnackbar instead of setNotification
            enqueueSnackbar('System connection issue detected', {
                variant: 'error',
                persist: true, // Keep critical errors visible until dismissed
                key: 'system-connection-error' // Prevent duplicate system errors
            });
        }
    }, [isError, enqueueSnackbar]);

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

            {/* Certificate Notifications */}
            <CertificateNotification />

            {/* CSRF Error Handler */}
            <CsrfErrorHandler />
        </Router>
    );
}

export default App;