import React from 'react';
import {
  Box,
  TextField,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Chip,
  Avatar,
  MenuItem,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import DnsIcon from '@mui/icons-material/Dns';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlined';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { ButtonLoader } from '@/shared/components/loading/index';

interface SecurityOptions {
  modes: string[];
  policies: string[];
}

interface OpcUaConnectionCardProps {
  opcuaConnected: boolean | null;
  ip: string;
  setIp: (value: string) => void;
  port: string;
  setPort: (value: string) => void;
  resourcePath: string;
  setResourcePath: (value: string) => void;
  securityMode: string;
  setSecurityMode: (value: string) => void;
  securityPolicy: string;
  setSecurityPolicy: (value: string) => void;
  securityOptions: SecurityOptions;
  handleConnect: () => void;
  handleDisconnect: () => void;
  loading: boolean;
}

const OpcUaConnectionCard: React.FC<OpcUaConnectionCardProps> = ({
  opcuaConnected,
  ip,
  setIp,
  port,
  setPort,
  resourcePath,
  setResourcePath,
  securityMode,
  setSecurityMode,
  securityPolicy,
  setSecurityPolicy,
  securityOptions,
  handleConnect,
  handleDisconnect,
  loading,
}) => (
  <Card>
    <CardHeader
      title="OPC UA gateway connection"
      subheader="Single-endpoint gateway. Manage machine connections under Machines."
      avatar={
        <Avatar>
          <DnsIcon />
        </Avatar>
      }
      action={
        <Chip
          label={
            opcuaConnected === null
              ? 'Unknown'
              : `Last check: ${opcuaConnected ? 'Connected' : 'Disconnected'}`
          }
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIp(e.target.value)}
            disabled={opcuaConnected === true}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Port"
            variant="outlined"
            fullWidth
            size="small"
            value={port}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPort(e.target.value)}
            disabled={opcuaConnected === true}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            label="Resource Path"
            variant="outlined"
            fullWidth
            size="small"
            value={resourcePath}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResourcePath(e.target.value)}
            disabled={opcuaConnected === true}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecurityMode(e.target.value)}
            disabled={opcuaConnected === true}
          >
            {securityOptions.modes.map((mode: string) => (
              <MenuItem key={mode} value={mode}>
                {mode}
              </MenuItem>
            ))}
            {securityOptions.modes.length === 0 && <MenuItem value="None">None</MenuItem>}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecurityPolicy(e.target.value)}
            disabled={opcuaConnected === true}
          >
            {securityOptions.policies.map((policy: string) => (
              <MenuItem key={policy} value={policy}>
                {policy}
              </MenuItem>
            ))}
            {securityOptions.policies.length === 0 && <MenuItem value="None">None</MenuItem>}
          </TextField>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <ButtonLoader
                variant="contained"
                color="primary"
                onClick={handleConnect}
                loading={loading && !opcuaConnected}
                disabled={opcuaConnected === true || loading}
                startIcon={<PlayCircleOutlineIcon />}
                sx={{ mr: 1 }}
                size="small"
              >
                Connect
              </ButtonLoader>
              <ButtonLoader
                variant="outlined"
                color="secondary"
                onClick={handleDisconnect}
                loading={loading && opcuaConnected === true}
                disabled={!opcuaConnected || loading}
                startIcon={<StopCircleIcon />}
                size="small"
              >
                Disconnect
              </ButtonLoader>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </CardContent>
  </Card>
);

export default OpcUaConnectionCard;
