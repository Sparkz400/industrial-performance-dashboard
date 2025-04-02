import React from 'react';
import {
    Box,
    TextField,
    Button,
    Card,
    CardHeader,
    CardContent,
    Divider,
    Chip,
    Avatar,
    MenuItem
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import DnsIcon from '@mui/icons-material/Dns';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import StopCircleIcon from '@mui/icons-material/StopCircle';

const OpcUaConnectionCard = ({
                                 opcuaConnected,
                                 ip, setIp,
                                 port, setPort,
                                 resourcePath, setResourcePath,
                                 securityMode, setSecurityMode,
                                 securityPolicy, setSecurityPolicy,
                                 securityOptions,
                                 handleConnect,
                                 handleDisconnect,
                                 loading
                             }) => {
    return (
        <Card>
            <CardHeader
                title="OPC UA Server Connection"
                avatar={<Avatar><DnsIcon /></Avatar>}
                action={
                    <Chip
                        label={opcuaConnected ? 'Connected' : 'Disconnected'}
                        color={opcuaConnected ? 'success' : 'default'}
                        size="small"
                    />
                }
                sx={{ pb: 1 }}
            />
            <Divider />
            <CardContent sx={{ pt: 2 }}>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            label="IP Address"
                            variant="outlined"
                            fullWidth
                            size="small"
                            value={ip}
                            onChange={(e) => setIp(e.target.value)}
                            disabled={opcuaConnected}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            label="Port"
                            variant="outlined"
                            fullWidth
                            size="small"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            disabled={opcuaConnected}
                        />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                        <TextField
                            label="Resource Path"
                            variant="outlined"
                            fullWidth
                            size="small"
                            value={resourcePath}
                            onChange={(e) => setResourcePath(e.target.value)}
                            disabled={opcuaConnected}
                        />
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            label="Security Mode"
                            variant="outlined"
                            fullWidth
                            size="small"
                            select
                            value={securityMode}
                            onChange={(e) => setSecurityMode(e.target.value)}
                            disabled={opcuaConnected}
                        >
                            {securityOptions.modes.map((mode) => (
                                <MenuItem key={mode} value={mode}>
                                    {mode}
                                </MenuItem>
                            ))}
                            {securityOptions.modes.length === 0 && (
                                <MenuItem value="None">None</MenuItem>
                            )}
                        </TextField>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            label="Security Policy"
                            variant="outlined"
                            fullWidth
                            size="small"
                            select
                            value={securityPolicy}
                            onChange={(e) => setSecurityPolicy(e.target.value)}
                            disabled={opcuaConnected}
                        >
                            {securityOptions.policies.map((policy) => (
                                <MenuItem key={policy} value={policy}>
                                    {policy}
                                </MenuItem>
                            ))}
                            {securityOptions.policies.length === 0 && (
                                <MenuItem value="None">None</MenuItem>
                            )}
                        </TextField>
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                        <Box display="flex" justifyContent="space-between">
                            <Box>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    onClick={handleConnect}
                                    disabled={opcuaConnected || loading}
                                    startIcon={<PlayCircleOutlineIcon />}
                                    sx={{ mr: 1 }}
                                    size="small"
                                >
                                    Connect
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="secondary"
                                    onClick={handleDisconnect}
                                    disabled={!opcuaConnected || loading}
                                    startIcon={<StopCircleIcon />}
                                    size="small"
                                >
                                    Disconnect
                                </Button>
                            </Box>
                        </Box>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );
};

export default OpcUaConnectionCard;
