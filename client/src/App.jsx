import React, {useEffect, useState, Suspense, useMemo, useCallback} from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route
} from 'react-router-dom';
import {
    Box,
    CssBaseline,
    createTheme,
    ThemeProvider
} from '@mui/material';
import ResponsiveSidebar from './components/sidebar/sidebar.jsx';

// Lazy load pages
const DashboardManager = React.lazy(() => import('./pages/dashboardPage.jsx'));
const SettingsPage = React.lazy(() => import('./pages/settingsPage'));
const HelpPage = React.lazy(() => import('./pages/helpPage'));

function App() {
    const darkTheme = useMemo(
        () =>
            createTheme({
                palette: {
                    mode: 'dark',
                    primary: {
                        main: '#2b2d30',
                    },
                    background: {
                        default: '#1e1f22',
                        paper: '#1e1f22',
                    },
                },
            }),
        []
    );

    const [status, setStatus] = useState({ database: 'unknown', opcua: 'unknown' });
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [drawerWidth, setDrawerWidth] = useState(0);

    useEffect(() => {
        async function fetchStatus() {
            try {
                const res = await fetch('http://localhost:3000/api/status');
                const data = await res.json();
                setStatus(data);
            } catch (err) {
                // Handle error
            }
        }
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const toggleSidebar = useCallback(() => {
        setSidebarOpen((prev) => !prev);
    }, []);

    // Memoize the content box's style object to avoid re-creating it on each render.
    const contentBoxStyles = useMemo(
        () => ({
            flexGrow: 1,
            ml: `${drawerWidth}px`,
            overflow: 'auto',
            maxHeight: '100vh',
        }),
        [drawerWidth]
    );

    return (
        <ThemeProvider theme={darkTheme}>
            <Router>
                <Box sx={{ display: 'flex', minHeight: '100vh' }}>
                    <CssBaseline />
                    <ResponsiveSidebar
                        open={sidebarOpen}
                        onToggle={toggleSidebar}
                        onWidthChange={(width) => setDrawerWidth(width)}
                    />
                    <Box sx={contentBoxStyles}>
                        <Suspense fallback={<div>Loading...</div>}>
                            <Routes>
                                <Route path="/" element={<DashboardManager status={status} />} />
                                <Route path="/settings" element={<SettingsPage />} />
                                <Route path="/help" element={<HelpPage />} />
                            </Routes>
                        </Suspense>
                    </Box>
                </Box>
            </Router>
        </ThemeProvider>
    );
}

export default App;
