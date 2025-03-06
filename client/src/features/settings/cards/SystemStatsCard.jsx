import React from 'react';
import {
    Typography,
    Box,
    Button,
    Card,
    CardHeader,
    CardContent,
    Avatar,
    LinearProgress,
    Stack,
    Divider,
    Alert,
    CircularProgress
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import RefreshIcon from '@mui/icons-material/Refresh';

const SystemStatsCard = ({
                             systemStats,
                             lastStatsUpdate,
                             error,
                             formatUptime,
                             fetchSystemStats,
                             loading
                         }) => {
    return (
        <Card>
            <CardHeader
                title="System Information"
                avatar={<Avatar><InfoIcon /></Avatar>}
                subheader="Server and application status details"
            />
            <Divider />
            <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                    Server Resources
                </Typography>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Memory Usage
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ flexGrow: 1, mr: 1 }}>
                            <LinearProgress
                                variant="determinate"
                                value={systemStats?.memoryUsage?.percentUsed || 0}
                                sx={{ height: 8, borderRadius: 5 }}
                            />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            {systemStats?.memoryUsage ?
                                `${systemStats.memoryUsage.used} MB / ${systemStats.memoryUsage.total} MB` :
                                'Unknown'}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        CPU Usage
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ flexGrow: 1, mr: 1 }}>
                            <LinearProgress
                                variant="determinate"
                                value={systemStats?.cpuUsage || 0}
                                sx={{ height: 8, borderRadius: 5 }}
                            />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            {systemStats?.cpuUsage ? `${systemStats.cpuUsage}%` : 'Unknown'}
                        </Typography>
                    </Box>
                </Box>

                <Stack spacing={1} sx={{ mt: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Uptime</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {systemStats?.uptime !== undefined ? formatUptime(systemStats.uptime) : 'Unknown'}
                        </Typography>
                    </Box>
                    <Divider />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">CPU Cores</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {systemStats?.cpuInfo?.cores || 'Unknown'}
                        </Typography>
                    </Box>
                    <Divider />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Active Connections</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {systemStats?.activeConnections !== undefined ? systemStats.activeConnections : 'Unknown'}
                        </Typography>
                    </Box>
                    <Divider />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Last Restart</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {systemStats?.lastRestart ? new Date(systemStats.lastRestart).toLocaleString() : 'Unknown'}
                        </Typography>
                    </Box>
                </Stack>

                {error && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                        {error}
                    </Alert>
                )}

                {lastStatsUpdate && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                        {`Last updated: ${lastStatsUpdate.toLocaleString()}`}
                    </Typography>
                )}

                <Box sx={{ mt: 2 }}>
                    <Button
                        variant="outlined"
                        color="primary"
                        startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                        onClick={fetchSystemStats}
                        disabled={loading}
                        fullWidth
                    >
                        Refresh System Info
                    </Button>
                </Box>
            </CardContent>
        </Card>
    );
};

export default SystemStatsCard;