import React, { useState } from 'react';
import { Typography, Box, TextField, Button, Paper } from '@mui/material';
import Grid from '@mui/material/Grid2';
const SettingsPage = () => {
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('');
    const [opcuaConnected, setOpcuaConnected] = useState(false);
    const [dbOnline, setDbOnline] = useState(false);
    const [connectedAdress, setConnectedAdress] = useState('');

    const handleConnect = () => {
        // Placeholder for backend connection logic.
        // Replace with actual API calls to your Node OPC UA and PostgreSQL backend.
        if (ip && port) {
            setOpcuaConnected(true);
            setDbOnline(true);
            setConnectedAdress( ip + ':' + port);
        }
    };

    const handleDisconnect = () => {
        // Placeholder for backend disconnection logic.
        setOpcuaConnected(false);
        setDbOnline(false);
        setConnectedAdress('N/A');
    };

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
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="IP Address"
                            variant="outlined"
                            fullWidth
                            value={ip}
                            onChange={(e) => setIp(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Port"
                            variant="outlined"
                            fullWidth
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                        <Button variant="contained" color="primary" onClick={handleConnect}>
                            Connect
                        </Button>
                    </Grid>
                    <Grid item xs={12} sm={2}>
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
                    Connected IP: {connectedAdress}
                </Typography>
                <Typography variant="body1">
                    Database: {dbOnline ? 'Online' : 'Offline'}
                </Typography>
            </Paper>
        </Box>
    );
};

export default SettingsPage;
