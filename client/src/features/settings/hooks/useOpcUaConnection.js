// ===== ..\client\src\features\settings\hooks\useOpcUaConnection.js =====
import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '../../../config/config.js';
import { useSystemStatus } from '../../system/index.jsx';
import { useSnackbar } from 'notistack'; // Import useSnackbar

export const useOpcUaConnection = () => {
    const [loading, setLoading] = useState(false);
    const [opcuaConnected, setOpcuaConnected] = useState(false);
    const [connectedAddress, setConnectedAddress] = useState('');
    const [connectionHistory, setConnectionHistory] = useState([]);
    const [configChanged, setConfigChanged] = useState(false);
    // Removed alertInfo state
    const { enqueueSnackbar } = useSnackbar(); // Use the hook

    // Form states
    const [ip, setIp] = useState('localhost');
    const [port, setPort] = useState('4840');
    const [resourcePath, setResourcePath] = useState('/UA/MyLittleServer');
    const [securityMode, setSecurityMode] = useState('None');
    const [securityPolicy, setSecurityPolicy] = useState('None');
    const [securityOptions, setSecurityOptions] = useState({
        modes: ['None'],
        policies: ['None']
    });

    const { status, refreshStatus } = useSystemStatus();

    // Sanitize port input
    const sanitizePort = (value) => {
        const portNum = parseInt(value, 10);
        // Return default if NaN, less than 1, or greater than 65535
        return (isNaN(portNum) || portNum < 1 || portNum > 65535) ? 4840 : portNum;
    };


    // Load security options
    const loadSecurityOptions = useCallback(async () => {
        try {
            const response = await fetch(`${API_ENDPOINTS.opcua.status.replace('/status', '')}/security-options`);
            if (response.ok) {
                const options = await response.json();
                setSecurityOptions({
                    modes: options.securityModes || ['None'],
                    policies: options.securityPolicies || ['None']
                });
            } else {
                // Add notification for failure
                const errorData = await response.text(); // Get text in case it's not JSON
                enqueueSnackbar(`Failed to load security options: ${response.status} ${errorData || 'Server Error'}`, { variant: 'warning' });
            }
        } catch (error) {
            console.error('Error loading security options:', error);
            // Add notification for failure
            enqueueSnackbar(`Error loading security options: ${error.message}`, { variant: 'error' });
        }
    }, [enqueueSnackbar]); // Add enqueueSnackbar dependency

    // Handle OPC UA connection
    const handleConnect = async () => {
        setLoading(true);
        try {
            const sanitizedPort = sanitizePort(port);
            const res = await fetch(API_ENDPOINTS.opcua.connect, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip,
                    port: sanitizedPort,
                    resourcePath,
                    securityMode,
                    securityPolicy
                })
            });

            const data = await res.json();

            if (res.ok) {
                setOpcuaConnected(true);
                setConnectedAddress(`${ip}:${sanitizedPort}`);
                setConnectionHistory(prev => [{
                    event: 'Connected',
                    timestamp: new Date().toISOString(),
                    details: `Connected to ${ip}:${sanitizedPort} with ${securityMode}/${securityPolicy}`
                }, ...prev.slice(0, 9)]);
                // Replace setAlertInfo
                enqueueSnackbar('Successfully connected to OPC UA server', { variant: 'success' });
                refreshStatus(); // Refresh overall system status
            } else {
                // Replace setAlertInfo
                enqueueSnackbar(`Failed to connect: ${data.error || 'Unknown error'}`, { variant: 'error' });
                setConnectionHistory(prev => [{
                    event: 'Connection Failed',
                    timestamp: new Date().toISOString(),
                    details: data.error || 'Unknown error'
                }, ...prev.slice(0, 9)]);
            }
        } catch (err) {
            console.error('Error connecting to OPC UA:', err);
            // Replace setAlertInfo
            enqueueSnackbar(`Error connecting: ${err.message}`, { variant: 'error' });
            setConnectionHistory(prev => [{
                event: 'Connection Error',
                timestamp: new Date().toISOString(),
                details: err.message
            }, ...prev.slice(0, 9)]);
        } finally {
            setLoading(false);
        }
    };

    // Handle OPC UA disconnection
    const handleDisconnect = async () => {
        setLoading(true);
        try {
            const res = await fetch(API_ENDPOINTS.opcua.disconnect, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await res.json();

            if (res.ok) {
                setOpcuaConnected(false);
                setConnectedAddress('');
                setConnectionHistory(prev => [{
                    event: 'Disconnected',
                    timestamp: new Date().toISOString(),
                    details: 'Manually disconnected'
                }, ...prev.slice(0, 9)]);
                // Replace setAlertInfo
                enqueueSnackbar('Successfully disconnected from OPC UA server', { variant: 'info' });
                refreshStatus(); // Refresh overall system status
            } else {
                // Replace setAlertInfo
                enqueueSnackbar(`Failed to disconnect: ${data.error || 'Unknown error'}`, { variant: 'error' });
            }
        } catch (err) {
            console.error('Error disconnecting from OPC UA:', err);
            // Replace setAlertInfo
            enqueueSnackbar(`Error disconnecting: ${err.message}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Fetch OPC UA connection status
    const fetchConnectionStatus = useCallback(async () => { // Make it useCallback
        try {
            const res = await fetch(API_ENDPOINTS.opcua.status);
            const data = await res.json();

            if (res.ok) {
                setOpcuaConnected(data.connected);
                if (data.connected && data.config) {
                    setIp(data.config.ip || 'localhost'); // Add defaults
                    setPort(data.config.port?.toString() || '4840');
                    setResourcePath(data.config.resourcePath || '/UA/MyLittleServer');
                    setConnectedAddress(`${data.config.ip}:${data.config.port}`);
                    setSecurityMode(data.config.securityMode || 'None');
                    setSecurityPolicy(data.config.securityPolicy || 'None');
                } else {
                    setConnectedAddress('');
                    // Optionally reset form fields if not connected
                    // setIp('localhost');
                    // setPort('4840');
                    // setResourcePath('/UA/MyLittleServer');
                    // setSecurityMode('None');
                    // setSecurityPolicy('None');
                }
            } else {
                console.error('Error fetching status:', data.error);
                // Add notification for failure
                enqueueSnackbar(`Failed to fetch OPC UA status: ${data.error || 'Unknown'}`, { variant: 'warning' });
            }
        } catch (err) {
            console.error('Error fetching connection status:', err);
            // Add notification for failure
            enqueueSnackbar(`Error fetching OPC UA status: ${err.message}`, { variant: 'error' });
        }
    }, [enqueueSnackbar]); // Add dependencies

    // Check for config changes
    useEffect(() => {
        // Ensure status and details exist before accessing nested properties
        const currentOpcuaStatus = status?.opcua?.details?.config;
        const isChanged = ip !== (currentOpcuaStatus?.ip || 'localhost') ||
            port !== (currentOpcuaStatus?.port?.toString() || '4840') ||
            resourcePath !== (currentOpcuaStatus?.resourcePath || '/UA/MyLittleServer') ||
            securityMode !== (currentOpcuaStatus?.securityMode || 'None') ||
            securityPolicy !== (currentOpcuaStatus?.securityPolicy || 'None');

        setConfigChanged(isChanged);
    }, [ip, port, resourcePath, securityMode, securityPolicy, status]);

    // Load data on component mount
    useEffect(() => {
        void fetchConnectionStatus();
        void loadSecurityOptions();
    }, [loadSecurityOptions, fetchConnectionStatus]); // Add fetchConnectionStatus here

    // Removed alertInfo and setAlertInfo from return
    return {
        loading,
        setLoading,
        opcuaConnected,
        connectedAddress,
        connectionHistory,
        configChanged,
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
        fetchConnectionStatus
    };
};