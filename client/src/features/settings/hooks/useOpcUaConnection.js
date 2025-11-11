import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '../../../config/config.js';
import { useSystemStatus } from '../../system/index.jsx';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api.js';

export const useOpcUaConnection = () => {
    const [loading, setLoading] = useState(false);
    const [opcuaConnected, setOpcuaConnected] = useState(false);
    const [connectedAddress, setConnectedAddress] = useState('');
    const [connectionHistory, setConnectionHistory] = useState([]);
    const [configChanged, setConfigChanged] = useState(false);
    const { enqueueSnackbar } = useSnackbar();

    // Form states
    const [ip, setIp] = useState(() =>
        (typeof window !== 'undefined' && localStorage.getItem('opcua_ip')) || 'localhost'
    );
    const [port, setPort] = useState(() =>
        (typeof window !== 'undefined' && localStorage.getItem('opcua_port')) || '4840'
    );
    const [resourcePath, setResourcePath] = useState(() =>
        (typeof window !== 'undefined' && localStorage.getItem('opcua_resourcePath')) || ''
    );
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
    const handleConnect = useCallback(async () => {
        setLoading(true);
        try {
            const config = {
                ip,
                port: sanitizePort(port),
                resourcePath,
                securityMode,
                securityPolicy
            };

            const data = await api.post(API_ENDPOINTS.opcua.connect, config);

            setOpcuaConnected(true);
            setConnectedAddress(`${ip}:${sanitizePort(port)}`);

            // IP-Konfig speichern
            localStorage.setItem('opcuaConfig', JSON.stringify(config));

            // ... History/Status-Update wie gehabt
        } catch (error) {
            console.error('Error connecting to OPC UA:', error);
            enqueueSnackbar(`Error connecting to OPC UA: ${error.message}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [ip, port, resourcePath, securityMode, securityPolicy, enqueueSnackbar]);

    // Handle OPC UA disconnection
    const handleDisconnect = async () => {
        setLoading(true);
        try {
            const data = await api.post(API_ENDPOINTS.opcua.disconnect, {});

            // If we reach here, the request was successful
            setOpcuaConnected(false);
            setConnectedAddress('');
            setConnectionHistory(prev => [{
                event: 'Disconnected',
                timestamp: new Date().toISOString(),
                details: 'Manually disconnected'
            }, ...prev.slice(0, 9)]);
            enqueueSnackbar(data.message || 'Successfully disconnected from OPC UA server', { variant: 'info' });
            refreshStatus();

        } catch (err) {
            // Errors from api.post are caught here
            console.error('Error disconnecting from OPC UA:', err);
            enqueueSnackbar(`Error disconnecting: ${err.message || 'Unknown error'}`, { variant: 'error' });
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
                    setResourcePath(data.config.resourcePath || '');
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

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem('opcua_ip', ip);
        localStorage.setItem('opcua_port', port);
        localStorage.setItem('opcua_resourcePath', resourcePath);
    }, [ip, port, resourcePath]);

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
        const saved = localStorage.getItem('opcuaConfig');
        if (saved) {
            try {
                const cfg = JSON.parse(saved);
                if (cfg.ip) setIp(cfg.ip);
                if (cfg.port) setPort(cfg.port.toString());
                if (typeof cfg.resourcePath === 'string') setResourcePath(cfg.resourcePath);
                if (cfg.securityMode) setSecurityMode(cfg.securityMode);
                if (cfg.securityPolicy) setSecurityPolicy(cfg.securityPolicy);
            } catch (e) {
                console.warn('Failed to parse saved OPC UA config', e);
            }
        }

        void fetchConnectionStatus();
        void loadSecurityOptions();
    }, [fetchConnectionStatus, loadSecurityOptions]);


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