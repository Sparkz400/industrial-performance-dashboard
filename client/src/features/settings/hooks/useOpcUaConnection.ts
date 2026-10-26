import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '@/config/config';
import { useStatusStore } from '@/stores/useStatusStore';
import { useSnackbar } from 'notistack';
import api from '@/utils/api';

interface SecurityOptions {
  modes: string[];
  policies: string[];
}

interface ConnectionHistoryEntry {
  event: string;
  timestamp: string;
  details: string;
}

interface OpcUaConfig {
  ip?: string;
  port?: number | string;
  resourcePath?: string;
  securityMode?: string;
  securityPolicy?: string;
}

interface OpcUaStatusResponse {
  connected: boolean;
  config?: OpcUaConfig;
  error?: string;
}

interface OpcUaConnectionReturn {
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  opcuaConnected: boolean;
  connectedAddress: string;
  connectionHistory: ConnectionHistoryEntry[];
  configChanged: boolean;
  ip: string;
  setIp: React.Dispatch<React.SetStateAction<string>>;
  port: string;
  setPort: React.Dispatch<React.SetStateAction<string>>;
  resourcePath: string;
  setResourcePath: React.Dispatch<React.SetStateAction<string>>;
  securityMode: string;
  setSecurityMode: React.Dispatch<React.SetStateAction<string>>;
  securityPolicy: string;
  setSecurityPolicy: React.Dispatch<React.SetStateAction<string>>;
  securityOptions: SecurityOptions;
  handleConnect: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  fetchConnectionStatus: () => Promise<void>;
}

export const useOpcUaConnection = (): OpcUaConnectionReturn => {
  const [loading, setLoading] = useState<boolean>(false);
  const [opcuaConnected, setOpcuaConnected] = useState<boolean>(false);
  const [connectedAddress, setConnectedAddress] = useState<string>('');
  const [connectionHistory, setConnectionHistory] = useState<ConnectionHistoryEntry[]>([]);
  const [configChanged, setConfigChanged] = useState<boolean>(false);
  const { enqueueSnackbar } = useSnackbar();

  // Form states
  const [ip, setIp] = useState<string>(
    () => (typeof window !== 'undefined' && localStorage.getItem('opcua_ip')) || 'localhost',
  );
  const [port, setPort] = useState<string>(
    () => (typeof window !== 'undefined' && localStorage.getItem('opcua_port')) || '4840',
  );
  const [resourcePath, setResourcePath] = useState<string>(
    () => (typeof window !== 'undefined' && localStorage.getItem('opcua_resourcePath')) || '',
  );
  const [securityMode, setSecurityMode] = useState<string>('None');
  const [securityPolicy, setSecurityPolicy] = useState<string>('None');
  const [securityOptions, setSecurityOptions] = useState<SecurityOptions>({
    modes: ['None'],
    policies: ['None'],
  });

  const status = useStatusStore((s) => s.status);
  const refreshStatus = useStatusStore((s) => s.refreshStatus);

  // Sanitize port input
  const sanitizePort = (value: string): number => {
    const portNum = parseInt(value, 10);
    // Return default if NaN, less than 1, or greater than 65535
    return isNaN(portNum) || portNum < 1 || portNum > 65535 ? 4840 : portNum;
  };

  // Load security options
  const loadSecurityOptions = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        `${API_ENDPOINTS.opcua.status.replace('/status', '')}/security-options`,
        { credentials: 'include' },
      );
      if (response.ok) {
        const options = await response.json();
        setSecurityOptions({
          modes: options.securityModes || ['None'],
          policies: options.securityPolicies || ['None'],
        });
      } else {
        // Add notification for failure
        const errorData = await response.text();
        enqueueSnackbar(
          `Failed to load security options: ${response.status} ${errorData || 'Server Error'}`,
          { variant: 'warning' },
        );
      }
    } catch (error) {
      console.error('Error loading security options:', error);
      // Add notification for failure
      enqueueSnackbar(`Error loading security options: ${(error as Error).message}`, {
        variant: 'error',
      });
    }
  }, [enqueueSnackbar]);

  // Handle OPC UA connection
  const handleConnect = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const config: OpcUaConfig = {
        ip,
        port: sanitizePort(port),
        resourcePath,
        securityMode,
        securityPolicy,
      };

      await api.post(API_ENDPOINTS.opcua.connect, config);

      setOpcuaConnected(true);
      setConnectedAddress(`${ip}:${sanitizePort(port)}`);

      // IP-Konfig speichern
      localStorage.setItem('opcuaConfig', JSON.stringify(config));

      // ... History/Status-Update wie gehabt
    } catch (error) {
      console.error('Error connecting to OPC UA:', error);
      enqueueSnackbar(`Error connecting to OPC UA: ${(error as Error).message}`, {
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [ip, port, resourcePath, securityMode, securityPolicy, enqueueSnackbar]);

  // Handle OPC UA disconnection
  const handleDisconnect = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = (await api.post(API_ENDPOINTS.opcua.disconnect, {})) as { message?: string };

      // If we reach here, the request was successful
      setOpcuaConnected(false);
      setConnectedAddress('');
      setConnectionHistory((prev: ConnectionHistoryEntry[]) => [
        {
          event: 'Disconnected',
          timestamp: new Date().toISOString(),
          details: 'Manually disconnected',
        },
        ...prev.slice(0, 9),
      ]);
      enqueueSnackbar(data.message || 'Successfully disconnected from OPC UA server', {
        variant: 'info',
      });
      refreshStatus();
    } catch (err) {
      // Errors from api.post are caught here
      console.error('Error disconnecting from OPC UA:', err);
      enqueueSnackbar(`Error disconnecting: ${(err as Error).message || 'Unknown error'}`, {
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch OPC UA connection status
  const fetchConnectionStatus = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(API_ENDPOINTS.opcua.status, { credentials: 'include' });
      const data: OpcUaStatusResponse = await res.json();

      if (res.ok) {
        setOpcuaConnected(data.connected);
        if (data.connected && data.config) {
          setIp(data.config.ip || 'localhost');
          setPort(data.config.port?.toString() || '4840');
          setResourcePath(data.config.resourcePath || '');
          setConnectedAddress(`${data.config.ip}:${data.config.port}`);
          setSecurityMode(data.config.securityMode || 'None');
          setSecurityPolicy(data.config.securityPolicy || 'None');
        } else {
          setConnectedAddress('');
        }
      } else {
        console.error('Error fetching status:', data.error);
        // Add notification for failure
        enqueueSnackbar(`Failed to fetch OPC UA status: ${data.error || 'Unknown'}`, {
          variant: 'warning',
        });
      }
    } catch (err) {
      console.error('Error fetching connection status:', err);
      // Add notification for failure
      enqueueSnackbar(`Error fetching OPC UA status: ${(err as Error).message}`, {
        variant: 'error',
      });
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('opcua_ip', ip);
    localStorage.setItem('opcua_port', port);
    localStorage.setItem('opcua_resourcePath', resourcePath);
  }, [ip, port, resourcePath]);

  // Check for config changes
  useEffect(() => {
    // Ensure status and details exist before accessing nested properties
    const currentOpcuaStatus = (status?.opcua?.details as Record<string, unknown>)?.config as
      OpcUaConfig | undefined;
    const isChanged =
      ip !== (currentOpcuaStatus?.ip || 'localhost') ||
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
        const cfg: OpcUaConfig = JSON.parse(saved);
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
    fetchConnectionStatus,
  };
};
