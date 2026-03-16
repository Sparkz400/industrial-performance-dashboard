/**
 * Re-export shared status constants and helpers.
 * Kept as a compatibility shim so existing server imports continue to work.
 */
import {
  ConnectionStatus,
  ServiceName,
  getStatusLabel,
  getStatusColor,
} from "@performance-dashboard/shared";

export type { ConnectionStatus, ServiceName };

const StatusConstants = {
  // Connection states
  CONNECTED: ConnectionStatus.CONNECTED,
  CONNECTING: ConnectionStatus.CONNECTING,
  DISCONNECTED: ConnectionStatus.DISCONNECTED,
  ERROR: ConnectionStatus.ERROR,
  WARNING: ConnectionStatus.WARNING,
  UNKNOWN: ConnectionStatus.UNKNOWN,

  // Service names
  DATABASE: ServiceName.DATABASE,
  OPCUA: ServiceName.OPCUA,

  // Helper functions
  getStatusLabel,
  getStatusColor,
};

export default StatusConstants;
