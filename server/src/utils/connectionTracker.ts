export interface ClientConnectionInfo {
  id: string;
  connectedAt: Date;
  ip?: string;
  userAgent?: string;
  query?: Record<string, string>;
  [key: string]: any;
}

export interface ConnectionHistoryEntry {
  type: "connect" | "disconnect";
  timestamp: Date;
  id: string;
  info?: Record<string, any>;
  duration?: number | null;
}

/**
 * Simple module to track active connections across the application
 */
class ConnectionTracker {
  activeConnections: number;
  connectionHistory: ConnectionHistoryEntry[];
  maxHistoryLength: number;
  connectedClients: Map<string, ClientConnectionInfo>;

  constructor() {
    this.activeConnections = 0;
    this.connectionHistory = [];
    this.maxHistoryLength = 100;
    this.connectedClients = new Map();
  }

  addConnection(socketId: string, info: Record<string, any> = {}): number {
    this.activeConnections++;

    const connectionInfo: ClientConnectionInfo = {
      id: socketId,
      connectedAt: new Date(),
      ...info,
    };

    this.connectedClients.set(socketId, connectionInfo);

    this.connectionHistory.push({
      type: "connect",
      timestamp: new Date(),
      id: socketId,
      info,
    });

    if (this.connectionHistory.length > this.maxHistoryLength) {
      this.connectionHistory = this.connectionHistory.slice(
        -this.maxHistoryLength,
      );
    }

    return this.activeConnections;
  }

  removeConnection(socketId: string): number {
    if (this.connectedClients.has(socketId)) {
      this.activeConnections = Math.max(0, this.activeConnections - 1);

      const clientInfo = this.connectedClients.get(socketId);
      this.connectedClients.delete(socketId);

      this.connectionHistory.push({
        type: "disconnect",
        timestamp: new Date(),
        id: socketId,
        duration: clientInfo
          ? new Date().getTime() - clientInfo.connectedAt.getTime()
          : null,
      });

      if (this.connectionHistory.length > this.maxHistoryLength) {
        this.connectionHistory = this.connectionHistory.slice(
          -this.maxHistoryLength,
        );
      }
    }

    return this.activeConnections;
  }

  getActiveConnectionCount(): number {
    return this.activeConnections;
  }

  getConnectedClients(): ClientConnectionInfo[] {
    return Array.from(this.connectedClients.values());
  }

  getConnectionHistory(
    limit: number = this.maxHistoryLength,
  ): ConnectionHistoryEntry[] {
    return this.connectionHistory.slice(-limit);
  }

  reset(): void {
    this.activeConnections = 0;
    this.connectionHistory = [];
    this.connectedClients.clear();
  }
}

const connectionTracker = new ConnectionTracker();

export default connectionTracker;
