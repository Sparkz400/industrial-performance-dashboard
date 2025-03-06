import React from 'react';
import Grid from '@mui/material/Grid2';
import OpcUaConnectionCard from '../cards/OpcUaConnectionCard';
import DatabaseConnectionCard from '../cards/DatabaseConnectionCard';
import ConnectionHistoryAccordion from '../ui/ConnectionHistoryAccordion';
import { useOpcUaConnection } from '../hooks/useOpcUaConnection';
import { useDatabaseConnection } from '../hooks/useDatabaseConnection';
import { useConnectionStats } from '../hooks/useConnectionStats';

const ConnectionsTab = ({ setGlobalAlertInfo }) => {
    const {
        loading: opcLoading,
        opcuaConnected,
        connectedAddress,
        connectionHistory,
        ip, setIp,
        port, setPort,
        resourcePath, setResourcePath,
        securityMode, setSecurityMode,
        securityPolicy, setSecurityPolicy,
        securityOptions,
        handleConnect,
        handleDisconnect,
        alertInfo: opcAlertInfo,
        setAlertInfo: setOpcAlertInfo,
    } = useOpcUaConnection();

    const {
        loading: dbLoading,
        dbOnline,
        dbHost,
        dbPort,
        dbUser,
        dbName,
        handleTestDbConnection,
        alertInfo: dbAlertInfo,
        setAlertInfo: setDbAlertInfo,
    } = useDatabaseConnection();

    const {
        formatDate
    } = useConnectionStats();

    // Forward alerts to the parent component
    React.useEffect(() => {
        if (opcAlertInfo.open) {
            setGlobalAlertInfo(opcAlertInfo);
        }
    }, [opcAlertInfo, setGlobalAlertInfo]);

    React.useEffect(() => {
        if (dbAlertInfo.open) {
            setGlobalAlertInfo(dbAlertInfo);
        }
    }, [dbAlertInfo, setGlobalAlertInfo]);

    return (
        <Grid container spacing={2}>
            {/* OPC UA Connection Settings */}
            <Grid item xs={12} lg={6}>
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
            <Grid item xs={12} lg={6}>
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
            <Grid item xs={12}>
                <ConnectionHistoryAccordion
                    connectionHistory={connectionHistory}
                    formatDate={formatDate}
                />
            </Grid>
        </Grid>
    );
};

export default ConnectionsTab;