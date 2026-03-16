import React from 'react';
import { Box, Badge, Tooltip, Typography, Stack } from '@mui/material';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { useEdgeStatus } from '../hooks/useEdgeQueries';

const EdgeStatusIndicator: React.FC = () => {
  const { data: status } = useEdgeStatus();

  // Don't render if edge mode is not enabled
  if (!status?.enabled) return null;

  const lastSync = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never';

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="caption" display="block">
            Cloud: {status.cloudConnected ? 'Connected' : 'Disconnected'}
          </Typography>
          <Typography variant="caption" display="block">
            Queue: {status.syncQueueDepth} records
          </Typography>
          <Typography variant="caption" display="block">
            Last sync: {lastSync}
          </Typography>
        </Box>
      }
    >
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Badge
          badgeContent={status.syncQueueDepth > 0 ? status.syncQueueDepth : undefined}
          color="warning"
          max={999}
        >
          {status.cloudConnected ? (
            <CloudIcon color="success" fontSize="small" />
          ) : (
            <CloudOffIcon color="error" fontSize="small" />
          )}
        </Badge>
      </Stack>
    </Tooltip>
  );
};

export default EdgeStatusIndicator;
