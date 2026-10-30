import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import type { Machine } from '@/types';

interface MachineStatusCardProps {
  machine: Machine;
  onEdit: (machine: Machine) => void;
  onDelete: (machine: Machine) => void;
  onConnect: (machine: Machine) => void;
  onDisconnect: (machine: Machine) => void;
  onManageMappings: (machine: Machine) => void;
}

const statusColorMap: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  connected: 'success',
  disconnected: 'default',
  connecting: 'info',
  error: 'error',
  no_mappings: 'warning',
};

const MachineStatusCard: React.FC<MachineStatusCardProps> = ({
  machine,
  onEdit,
  onDelete,
  onConnect,
  onDisconnect,
  onManageMappings,
}) => {
  const isConnected = machine.status === 'connected';

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
      }}
    >
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 1,
            mb: 1,
          }}
        >
          <Typography variant="h6" component="div" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {machine.name}
          </Typography>
          <Chip
            label={machine.status}
            color={statusColorMap[machine.status] || 'default'}
            size="small"
          />
        </Box>

        <Typography
          variant="body2"
          gutterBottom
          sx={{
            color: 'text.secondary',
            overflowWrap: 'anywhere',
          }}
        >
          {machine.endpointUrl}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          <Chip label={`Security: ${machine.securityMode}`} size="small" variant="outlined" />
          <Chip
            label={`${machine.mappingCount ?? 0} mappings`}
            size="small"
            variant="outlined"
            icon={<AccountTreeIcon />}
          />
          {!machine.isActive && (
            <Chip label="Inactive" size="small" color="warning" variant="outlined" />
          )}
        </Box>
      </CardContent>

      <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
        <Tooltip title="Manage Node Mappings">
          <IconButton
            aria-label={`Manage Node Mappings: ${machine.name}`}
            size="small"
            onClick={() => onManageMappings(machine)}
            color="primary"
          >
            <AccountTreeIcon />
          </IconButton>
        </Tooltip>

        {isConnected ? (
          <Tooltip title="Disconnect">
            <IconButton
              aria-label={`Disconnect: ${machine.name}`}
              size="small"
              onClick={() => onDisconnect(machine)}
              color="warning"
            >
              <LinkOffIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Connect">
            <IconButton
              aria-label={`Connect: ${machine.name}`}
              size="small"
              onClick={() => onConnect(machine)}
              color="success"
            >
              <LinkIcon />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Edit">
          <IconButton
            aria-label={`Edit: ${machine.name}`}
            size="small"
            onClick={() => onEdit(machine)}
          >
            <EditIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Delete">
          <IconButton
            aria-label={`Delete: ${machine.name}`}
            size="small"
            onClick={() => onDelete(machine)}
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
};

export default MachineStatusCard;
