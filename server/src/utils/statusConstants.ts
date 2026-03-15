/**
 * Standardized status constants to ensure consistency across the application
 */
const StatusConstants = {
  // Connection states
  CONNECTED: "CONNECTED" as const,
  CONNECTING: "CONNECTING" as const,
  DISCONNECTED: "DISCONNECTED" as const,
  ERROR: "ERROR" as const,
  WARNING: "WARNING" as const,
  UNKNOWN: "UNKNOWN" as const,

  // Service names
  DATABASE: "DATABASE" as const,
  OPCUA: "OPCUA" as const,

  // Human-readable labels
  getStatusLabel: (status: string): string => {
    switch (status) {
      case StatusConstants.CONNECTED:
        return "Connected";
      case StatusConstants.CONNECTING:
        return "Connecting...";
      case StatusConstants.DISCONNECTED:
        return "Disconnected";
      case StatusConstants.ERROR:
        return "Error";
      case StatusConstants.WARNING:
        return "Warning";
      case StatusConstants.UNKNOWN:
      default:
        return "Unknown";
    }
  },

  // Color mappings for UI
  getStatusColor: (status: string): string => {
    switch (status) {
      case StatusConstants.CONNECTED:
        return "success";
      case StatusConstants.CONNECTING:
        return "info";
      case StatusConstants.WARNING:
        return "warning";
      case StatusConstants.ERROR:
        return "error";
      case StatusConstants.DISCONNECTED:
        return "error";
      case StatusConstants.UNKNOWN:
      default:
        return "default";
    }
  },
};

export type ConnectionStatus =
  | typeof StatusConstants.CONNECTED
  | typeof StatusConstants.CONNECTING
  | typeof StatusConstants.DISCONNECTED
  | typeof StatusConstants.ERROR
  | typeof StatusConstants.WARNING
  | typeof StatusConstants.UNKNOWN;
export type ServiceName =
  | typeof StatusConstants.DATABASE
  | typeof StatusConstants.OPCUA;

export default StatusConstants;
