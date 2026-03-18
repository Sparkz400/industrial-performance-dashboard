import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  TextField,
  MenuItem,
  Stack,
  CircularProgress,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { useSpcAlerts, useAcknowledgeSpcAlert, type SpcAlertFilters } from '../hooks/useSpcQueries';

const severityColor: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

interface SpcAlertsListProps {
  profileId?: number;
  machineId?: number;
}

const SpcAlertsList: React.FC<SpcAlertsListProps> = ({ profileId, machineId }) => {
  const [filters, setFilters] = useState<SpcAlertFilters>({
    profileId,
    machineId,
  });

  const { data: alerts, isLoading } = useSpcAlerts(filters);
  const acknowledgeAlert = useAcknowledgeSpcAlert();

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        {!profileId && (
          <TextField
            label="Profile ID"
            type="number"
            size="small"
            value={filters.profileId || ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                profileId: e.target.value ? parseInt(e.target.value, 10) : undefined,
              }))
            }
            sx={{ width: 130 }}
          />
        )}
        {!machineId && (
          <TextField
            label="Machine ID"
            type="number"
            size="small"
            value={filters.machineId || ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                machineId: e.target.value ? parseInt(e.target.value, 10) : undefined,
              }))
            }
            sx={{ width: 130 }}
          />
        )}
        <TextField
          select
          label="Status"
          size="small"
          value={filters.acknowledged === undefined ? '' : String(filters.acknowledged)}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              acknowledged: e.target.value === '' ? undefined : e.target.value === 'true',
            }))
          }
          sx={{ width: 150 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="false">Unacknowledged</MenuItem>
          <MenuItem value="true">Acknowledged</MenuItem>
        </TextField>
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Profile</TableCell>
              <TableCell>Node Key</TableCell>
              <TableCell>Alert Type</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Threshold</TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : alerts && alerts.length > 0 ? (
              alerts.map((alert) => (
                <TableRow key={alert.id} hover>
                  <TableCell>{new Date(alert.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{alert.profileName ?? `Profile #${alert.profileId}`}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                      {alert.nodeKey}
                    </Typography>
                  </TableCell>
                  <TableCell>{alert.alertType}</TableCell>
                  <TableCell>{alert.value.toFixed(3)}</TableCell>
                  <TableCell>{alert.threshold.toFixed(3)}</TableCell>
                  <TableCell>
                    <Chip
                      label={alert.severity}
                      size="small"
                      color={severityColor[alert.severity] || 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {alert.acknowledgedAt ? (
                      <Chip label="Acknowledged" size="small" color="success" variant="outlined" />
                    ) : (
                      <Chip label="Open" size="small" color="warning" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {!alert.acknowledgedAt && (
                      <Button
                        size="small"
                        startIcon={<CheckIcon />}
                        onClick={() => acknowledgeAlert.mutate(alert.id)}
                        disabled={acknowledgeAlert.isPending}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    No SPC alerts found.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default SpcAlertsList;
