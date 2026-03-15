import React from 'react';
import Grid from '@mui/material/Grid2';
import OpcUaConnectionCard from '../cards/OpcUaConnectionCard';
import DatabaseConnectionCard from '../cards/DatabaseConnectionCard';
import ConnectionHistoryAccordion from '../ui/ConnectionHistoryAccordion';
import { useOpcUaConnection } from '../hooks/useOpcUaConnection';
import { useDatabaseConnection } from '../hooks/useDatabaseConnection';
import { useConnectionStats } from '../hooks/useConnectionStats';

const ConnectionsTab: React.FC = () => {
  const {
    loading: opcLoading,
    opcuaConnected,
    connectionHistory,
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
  } = useOpcUaConnection();

  const {
    loading: dbLoading,
    dbOnline,
    dbHost,
    dbPort,
    dbUser,
    dbName,
    handleTestDbConnection,
  } = useDatabaseConnection();

  const { formatDate } = useConnectionStats();

  return (
    <Grid container spacing={2}>
      {/* OPC UA Connection Settings */}
      <Grid size={{ xs: 12, lg: 6 }}>
        <OpcUaConnectionCard
          opcuaConnected={opcuaConnected}
          ip={ip}
          setIp={setIp}
          port={port}
          setPort={setPort}
          resourcePath={resourcePath}
          setResourcePath={setResourcePath}
          securityMode={securityMode}
          setSecurityMode={setSecurityMode}
          securityPolicy={securityPolicy}
          setSecurityPolicy={setSecurityPolicy}
          securityOptions={securityOptions}
          handleConnect={handleConnect}
          handleDisconnect={handleDisconnect}
          loading={opcLoading}
        />
      </Grid>

      {/* Database Connection Settings */}
      <Grid size={{ xs: 12, lg: 6 }}>
        <DatabaseConnectionCard
          dbOnline={dbOnline}
          dbHost={dbHost}
          dbPort={dbPort}
          dbUser={dbUser}
          dbName={dbName}
          handleTestDbConnection={handleTestDbConnection}
          loading={dbLoading}
        />
      </Grid>

      {/* Connection History */}
      <Grid size={{ xs: 12 }}>
        <ConnectionHistoryAccordion connectionHistory={connectionHistory} formatDate={formatDate} />
      </Grid>
    </Grid>
  );
};

export default ConnectionsTab;
