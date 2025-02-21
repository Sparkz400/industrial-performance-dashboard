import React, { useEffect, useState } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route
} from 'react-router-dom';
import {
    Box,
    CssBaseline,
    AppBar,
    Toolbar,
    Typography,
    createTheme,
    ThemeProvider
} from '@mui/material';
import io from 'socket.io-client';

import ResponsiveSidebar from './components/sidebar/sidebar.jsx';
import DashboardManager from './pages/dashboardPage.jsx';
import SettingsPage from './pages/settingsPage';
import HelpPage from './pages/helpPage';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#2b2d30'
        },
        background: {
            default: '#1e1f22',
            paper: '#1e1f22'
        }
    }
});

function App() {
    const [sensorData, setSensorData] = useState([]);
    const [status, setStatus] = useState({ database: 'unknown', opcua: 'unknown' });
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [drawerWidth, setDrawerWidth] = useState(0);

    useEffect(() => {
        const socket = io('http://localhost:3000');
        socket.on('sensorUpdate', (data) => {
            setSensorData((prev) => [data, ...prev]);
        });
        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        async function fetchStatus() {
            try {
                const res = await fetch('http://localhost:3000/api/status');
                const data = await res.json();
                setStatus(data);
            } catch (err) {
                console.error('Error fetching status:', err);
            }
        }
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const toggleSidebar = () => {
        setSidebarOpen((prev) => !prev);
    };

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
                    <Box sx={{
                        flexGrow: 1,
                        ml: `${drawerWidth}px`,
                        overflow: 'auto',
                        maxHeight: '100vh'
                    }}>
                        <Routes>
                            <Route path="/" element={<DashboardManager status={status} sensorData={sensorData} />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/help" element={<HelpPage />} />
                        </Routes>
                    </Box>
                </Box>
            </Router>
        </ThemeProvider>
    );
}

export default App;
