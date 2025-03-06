import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '../../../config/config.js';
import { useSystemStatus } from '../../system/index.jsx';

export const useOpcUaConnection = () => {
    const [loading, setLoading] = useState(false);
    const [opcuaConnected, setOpcuaConnected] = useState(false);
    const [connectedAddress, setConnectedAddress] = useState('');
    const [connectionHistory, setConnectionHistory] = useState([]);
    const [configChanged, setConfigChanged] = useState(false);
    const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'info' });

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
        const port = parseInt(value, 10);
        return (port > 0 && port <= 65535) ? port : 4840;
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
            }
        } catch (error) {
            console.error('Error loading security options:', error);
        }
    }, []);

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
                setAlertInfo({
                    open: true,
                    message: 'Successfully connected to OPC UA server',
                    severity: 'success'
                });
                refreshStatus();
            } else {
                setAlertInfo({
                    open: true,
                    message: `Failed to connect: ${data.error || 'Unknown error'}`,
                    severity: 'error'
                });
                setConnectionHistory(prev => [{
                    event: 'Connection Failed',
                    timestamp: new Date().toISOString(),
                    details: data.error || 'Unknown error'
                }, ...prev.slice(0, 9)]);
            }
        } catch (err) {
            console.error('Error connecting to OPC UA:', err);
            setAlertInfo({
                open: true,
                message: `Error connecting: ${err.message}`,
                severity: 'error'
            });
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
                setAlertInfo({
                    open: true,
                    message: 'Successfully disconnected from OPC UA server',
                    severity: 'info'
                });
                refreshStatus();
            } else {
                setAlertInfo({
                    open: true,
                    message: `Failed to disconnect: ${data.error || 'Unknown error'}`,
                    severity: 'error'
                });
            }
        } catch (err) {
            console.error('Error disconnecting from OPC UA:', err);
            setAlertInfo({
                open: true,
                message: `Error disconnecting: ${err.message}`,
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    // Fetch OPC UA connection status
    const fetchConnectionStatus = async () => {
        try {
            const res = await fetch(API_ENDPOINTS.opcua.status);
            const data = await res.json();

            if (res.ok) {
                setOpcuaConnected(data.connected);

                if (data.connected && data.config) {
                    setIp(data.config.ip);
                    setPort(data.config.port.toString());
                    setResourcePath(data.config.resourcePath);
                    setConnectedAddress(`${data.config.ip}:${data.config.port}`);

                    // Update security settings
                    if (data.config.securityMode) {
                        setSecurityMode(data.config.securityMode);
                    }

                    if (data.config.securityPolicy) {
                        setSecurityPolicy(data.config.securityPolicy);
                    }
                } else {
                    setConnectedAddress('');
                }
            } else {
                console.error('Error fetching status:', data.error);
            }
        } catch (err) {
            console.error('Error fetching connection status:', err);
        }
    };

    // Check for config changes
    useEffect(() => {
        // Set config changed flag when form values change
        const isChanged = ip !== (status?.opcua?.details?.config?.ip || 'localhost') ||
            port !== (status?.opcua?.details?.config?.port?.toString() || '4840') ||
            resourcePath !== (status?.opcua?.details?.config?.resourcePath || '/UA/MyLittleServer') ||
            securityMode !== (status?.opcua?.details?.config?.securityMode || 'None') ||
            securityPolicy !== (status?.opcua?.details?.config?.securityPolicy || 'None');

        setConfigChanged(isChanged);
    }, [ip, port, resourcePath, securityMode, securityPolicy, status]);

    // Load data on component mount
    useEffect(() => {
        void fetchConnectionStatus();
        void loadSecurityOptions();
    }, [loadSecurityOptions]);

    return {
        loading,
        setLoading,
        opcuaConnected,
        connectedAddress,
        connectionHistory,
        configChanged,
        alertInfo,
        setAlertInfo,
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