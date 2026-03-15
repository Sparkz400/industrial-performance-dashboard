import React from 'react';
import {
  Typography,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Avatar,
  Box,
  Tooltip,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import MemoryIcon from '@mui/icons-material/Memory';
import CodeIcon from '@mui/icons-material/Code';
import DnsIcon from '@mui/icons-material/Dns';
import RefreshIcon from '@mui/icons-material/Refresh';
import SystemStatsCard from '../cards/SystemStatsCard';
import { useSystemStats } from '../hooks/useSystemStats';
import { useConnectionStats } from '../hooks/useConnectionStats';

interface ActiveConnection {
  id: string;
  connectedAt: string;
  ip: string;
  userAgent?: string;
}

interface ConnectionHistoryEntry {
  id: string;
  type: 'connect' | 'disconnect';
  timestamp: string;
  duration?: number;
}

const SystemInfoTab: React.FC = () => {
  const { systemStats, lastStatsUpdate, error, formatUptime } = useSystemStats();

  const { loadingConnections, connectionStats, formatDuration, fetchConnectionStats } =
    useConnectionStats(true, 1000);

  return (
    <Card>
      <CardContent>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <SystemStatsCard
              systemStats={systemStats}
              lastStatsUpdate={lastStatsUpdate}
              error={error}
              formatUptime={formatUptime}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" gutterBottom>
              Application Information
            </Typography>

            <Box sx={{ mb: 3 }}>
              <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <MemoryIcon />
                </Avatar>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Node.js Version
                  </Typography>
                  <Typography variant="body1">
                    {systemStats?.platform?.release || 'v16.14.2'}
                  </Typography>
                </Box>
              </Card>

              <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                  <CodeIcon />
                </Avatar>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Platform
                  </Typography>
                  <Typography variant="body1">
                    {systemStats?.platform
                      ? `${systemStats.platform.type} (${systemStats.platform.platform})`
                      : 'Unknown'}
                  </Typography>
                </Box>
              </Card>

              <Card variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'error.main', mr: 2 }}>
                  <DnsIcon />
                </Avatar>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Process Memory
                  </Typography>
                  <Typography variant="body1">
                    {systemStats?.processMemory
                      ? `Heap: ${systemStats.processMemory.heapUsed} MB / ${systemStats.processMemory.heapTotal} MB`
                      : 'Unknown'}
                  </Typography>
                </Box>
              </Card>
            </Box>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Card>
              <CardHeader
                title="Connection Statistics"
                subheader={`${connectionStats?.activeCount || 0} active connections`}
                action={
                  <Tooltip title="Refresh Connection Stats">
                    <span>
                      <IconButton onClick={fetchConnectionStats} disabled={loadingConnections}>
                        {loadingConnections ? <CircularProgress size={20} /> : <RefreshIcon />}
                      </IconButton>
                    </span>
                  </Tooltip>
                }
              />
              <Divider />
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  Active Connections
                </Typography>

                {!connectionStats ? (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    Unable to fetch connection data. Please try refreshing.
                  </Alert>
                ) : connectionStats.activeConnections?.length > 0 ? (
                  <Box sx={{ mt: 2, maxHeight: 200, overflow: 'auto' }}>
                    {connectionStats.activeConnections.map((client: ActiveConnection) => (
                      <Box
                        key={client.id}
                        sx={{
                          p: 1,
                          mb: 1,
                          borderRadius: 1,
                          bgcolor: 'background.paper',
                          boxShadow: 1,
                        }}
                      >
                        <Typography variant="body2" component="div">
                          <strong>ID:</strong> {client.id.substring(0, 8)}...
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Connected:</strong>{' '}
                          {new Date(client.connectedAt).toLocaleString()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {client.ip} | {client.userAgent?.substring(0, 50)}...
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    No active connections
                  </Typography>
                )}

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle1" gutterBottom>
                  Connection History
                </Typography>

                {!connectionStats ? (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    Unable to fetch connection history. Please try refreshing.
                  </Alert>
                ) : connectionStats.history?.length > 0 ? (
                  <Box sx={{ mt: 2, maxHeight: 300, overflow: 'auto' }}>
                    {connectionStats.history.map((entry: ConnectionHistoryEntry, index: number) => (
                      <Box
                        key={index}
                        sx={{
                          p: 1,
                          mb: 1,
                          borderRadius: 1,
                          bgcolor: entry.type === 'connect' ? 'success.main' : 'error.main',
                          color: 'white',
                          opacity: 0.8,
                        }}
                      >
                        <Typography variant="body2" component="div">
                          <strong>{entry.type === 'connect' ? 'Connected' : 'Disconnected'}</strong>
                        </Typography>
                        <Typography variant="body2">
                          {new Date(entry.timestamp).toLocaleString()}
                        </Typography>
                        <Typography variant="caption">
                          ID: {entry.id.substring(0, 8)}...
                          {entry.duration && ` | Duration: ${formatDuration(entry.duration)}`}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    No connection history
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default SystemInfoTab;
