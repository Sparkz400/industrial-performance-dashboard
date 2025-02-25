import React, { useState, useEffect } from 'react';
import { Typography, Box, TextField, Button, Paper } from '@mui/material';
import Grid from '@mui/material/Grid2';

const SettingsPage = () => {
    const [ip, setIp] = useState('localhost');  // default IP
    const [port, setPort] = useState('4840');     // default port
    const [resourcePath, setResourcePath] = useState('/UA/MyLittleServer'); // default resource path
    const [opcuaConnected, setOpcuaConnected] = useState(false);
    const [dbOnline, setDbOnline] = useState(false);
    const [connectedAddress, setConnectedAddress] = useState('');

    const sanitizePort = (value) => {
        const port = parseInt(value, 10);
        return (port > 0 && port <= 65535) ? port : 4840;
    };

    const handleConnect = async () => {
        try {
            const sanitizedPort = sanitizePort(port);
            const res = await fetch('http://localhost:3000/api/opcua/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip, sanitizedPort, resourcePath })
            });
            const data = await res.json();
            if (res.ok) {
                setOpcuaConnected(true);
                setConnectedAddress(`${ip}:${sanitizedPort}`);
            } else {
                console.error(data.error);
                setOpcuaConnected(false);
            }
        } catch (err) {
            console.error('Error connecting to OPC UA:', err);
            setOpcuaConnected(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/opcua/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (res.ok) {
                setOpcuaConnected(false);
                setConnectedAddress('');
            } else {
                console.error(data.error);
            }
        } catch (err) {
            console.error('Error disconnecting from OPC UA:', err);
        }
    };

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch('http://localhost:3000/api/opcua/status');
                const data = await res.json();
                if (res.ok) {
                    // Update connection state based on the backend response.
                    setOpcuaConnected(data.connected);
                    if (data.connected && data.config) {
                        setIp(data.config.ip);
                        setPort(data.config.port);
                        setResourcePath(data.config.resourcePath);
                        setConnectedAddress(`${data.config.ip}:${data.config.port}`);
                    } else {
                        setConnectedAddress('');
                    }
                } else {
                    console.error('Error fetching status:', data.error);
                }
            } catch (err) {
                console.error('Error fetching connection status:', err);
            }
        };

        fetchStatus().then(() => {});
    }, []);

    return (
        <Box p={2}>
            <Typography variant="h4" gutterBottom>
                Settings
            </Typography>

            <Paper elevation={3} style={{ padding: '16px', marginBottom: '16px' }}>
                <Typography variant="h6" gutterBottom>
                    OPC UA Server Connection
                </Typography>
                <Grid container spacing={2} alignItems="center">
                    <Grid xs={12} sm={3}>
                        <TextField
                            label="IP Address"
                            variant="outlined"
                            fullWidth
                            value={ip}
                            onChange={(e) => setIp(e.target.value)}
                        />
                    </Grid>
                    <Grid xs={12} sm={3}>
                        <TextField
                            label="Port"
                            variant="outlined"
                            fullWidth
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                        />
                    </Grid>
                    <Grid xs={12} sm={3}>
                        <TextField
                            label="Resource Path"
                            variant="outlined"
                            fullWidth
                            value={resourcePath}
                            onChange={(e) => setResourcePath(e.target.value)}
                        />
                    </Grid>
                    <Grid xs={12} sm={3}>
                        <Button variant="contained" color="primary" onClick={handleConnect}>
                            Connect
                        </Button>
                    </Grid>
                    <Grid xs={12} sm={3}>
                        <Button variant="outlined" color="secondary" onClick={handleDisconnect}>
                            Disconnect
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Paper elevation={3} style={{ padding: '16px' }}>
                <Typography variant="h6" gutterBottom>
                    Connection Status
                </Typography>
                <Typography variant="body1">
                    OPC UA Server: {opcuaConnected ? 'Connected' : 'Disconnected'}
                </Typography>
                <Typography variant="body1">
                    Connected IP: {connectedAddress || 'N/A'}
                </Typography>
                <Typography variant="body1">
                    Database: {dbOnline ? 'Online' : 'Offline'}
                </Typography>
            </Paper>
        </Box>
    );
};

export default SettingsPage;
