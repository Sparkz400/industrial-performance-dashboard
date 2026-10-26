import * as opcuaClient from "../opcuaClient.js";
import statusManager from "../../utils/status.js";
import StatusConstants from "../../utils/statusConstants.js";
import logger from "../../utils/logger.js";
import { EventEmitter } from "events";
import * as opcua from "node-opcua";
import config from "../../config/config.js";
import type { OpcuaConnectionResult } from "../opcuaClient.js";

export interface OpcuaConfig {
  ip: string;
  port: number;
  resourcePath: string;
  securityMode: string;
  securityPolicy: string;
}

export interface ConnectionInfo {
  connected: boolean;
  status: string;
  statusText: string;
  config: OpcuaConfig;
  securityMode: string;
  securityPolicy: string;
  details: Record<string, any>;
  lastUpdated: string;
}

export interface SecurityOptions {
  securityModes: string[];
  securityPolicies: string[];
}

/**
 * Manager for OPC UA connections with resilient reconnection and certificate support
 */
class OpcuaConnectionManager extends EventEmitter {
  isConnecting: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connectionAttempts: number;
  maxConnectionAttempts: number;
  retryDelay: number;
  healthCheckInterval: ReturnType<typeof setInterval> | null;
  currentConfig: OpcuaConfig;
  currentConnection: OpcuaConnectionResult | null;

  constructor() {
    super();
    this.isConnecting = false;
    this.reconnectTimer = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.retryDelay = 5000;
    this.healthCheckInterval = null;

    this.currentConfig = {
      ip: config.OPCUA_IP,
      port: config.OPCUA_PORT,
      resourcePath: config.OPCUA_RESOURCE_PATH,
      securityMode: config.OPCUA_SECURITY_MODE,
      securityPolicy: config.OPCUA_SECURITY_POLICY,
    };

    this.currentConnection = null;
    this.initializeCertificates();

    opcuaClient.opcuaEmitter.on("untrustedCertificate", (certInfo: any) => {
      logger.info(
        `Forwarding untrusted certificate event for ${certInfo.serverUri}`,
      );
      this.emit("untrustedCertificate", certInfo);
    });

    opcuaClient.opcuaEmitter.on("certificateAccepted", (certInfo: any) => {
      logger.info(`Certificate accepted for ${certInfo.serverUri}`);
      this.emit("certificateAccepted", certInfo);
    });

    opcuaClient.opcuaEmitter.on("certificateError", (errorInfo: any) => {
      logger.error(`Certificate error: ${errorInfo.error}`);
      this.emit("certificateError", errorInfo);
    });
  }

  async initializeCertificates(): Promise<void> {
    try {
      await opcuaClient.initializeCertificates();
    } catch (error) {
      logger.error("Error initializing certificates:", error);
    }
  }

  getEndpointUrl(cfg: OpcuaConfig = this.currentConfig): string {
    return `opc.tcp://${cfg.ip}:${cfg.port}${cfg.resourcePath}`;
  }

  async startConnection(): Promise<void> {
    if (this.isConnecting) {
      logger.info("Connection attempt already in progress");
      return;
    }

    this.isConnecting = true;
    this.connectionAttempts++;

    const endpointUrl = this.getEndpointUrl();
    const securityOptions = {
      securityMode: this.currentConfig.securityMode,
      securityPolicy: this.currentConfig.securityPolicy,
    };

    logger.info(
      `Attempting OPC UA connection to: ${endpointUrl} with SecurityMode=${securityOptions.securityMode}, SecurityPolicy=${securityOptions.securityPolicy} (Attempt ${this.connectionAttempts})`,
    );

    statusManager.setOpcuaStatus(StatusConstants.CONNECTING, {
      endpoint: endpointUrl,
      securityMode: securityOptions.securityMode,
      securityPolicy: securityOptions.securityPolicy,
      attempt: this.connectionAttempts,
    });

    try {
      const connectionPromise = opcuaClient.connectAndSubscribe(
        endpointUrl,
        securityOptions,
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Connection timeout after 30 seconds")),
          30000,
        );
      });

      this.currentConnection = await Promise.race([
        connectionPromise,
        timeoutPromise,
      ]);

      if (this.currentConnection) {
        logger.info("OPC UA connection and subscription successful");

        statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
          endpoint: endpointUrl,
          connected: true,
          config: { ...this.currentConfig },
          securityMode: this.currentConnection.securityMode,
          securityPolicy: this.currentConnection.securityPolicy,
          timestamp: new Date().toISOString(),
        });

        this.connectionAttempts = 0;
        this.retryDelay = 5000;

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        this.startHealthCheck();
        this.emit("connected", {
          config: this.currentConfig,
          securityMode: this.currentConnection.securityMode,
          securityPolicy: this.currentConnection.securityPolicy,
        });
      } else {
        throw new Error(
          "Failed to establish OPC UA connection (connectAndSubscribe returned null)",
        );
      }
    } catch (error: any) {
      logger.error("Error during OPC UA connection attempt:", {
        message: error.message,
        statusCode: error.statusCode ? error.statusCode.toString() : "N/A",
        stack: error.stack,
        endpoint: endpointUrl,
        securityMode: securityOptions.securityMode,
        securityPolicy: securityOptions.securityPolicy,
        attempt: this.connectionAttempts,
      });

      statusManager.setOpcuaStatus(StatusConstants.ERROR, {
        message: `Connection failed: ${error.message}`,
        error: error.message,
        endpoint: endpointUrl,
        timestamp: new Date().toISOString(),
      });

      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.connectionAttempts < this.maxConnectionAttempts) {
      const delay = Math.min(
        this.retryDelay * Math.pow(1.5, this.connectionAttempts - 1),
        300000,
      );

      logger.info(
        `Scheduling OPC UA reconnection in ${delay / 1000} seconds (Attempt ${this.connectionAttempts + 1}/${this.maxConnectionAttempts})`,
      );

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.isConnecting = false;
        void this.startConnection();
      }, delay);
    } else {
      logger.error(
        `Failed to connect after ${this.maxConnectionAttempts} attempts. Stopping automatic retries. Manual intervention required.`,
      );
      statusManager.setOpcuaStatus(StatusConstants.ERROR, {
        message: `Max connection attempts (${this.maxConnectionAttempts}) reached. Auto-reconnect stopped.`,
        endpoint: this.getEndpointUrl(),
      });
      this.connectionAttempts = 0;
    }
  }

  startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const healthCheckIntervalMs = config.OPCUA_HEALTH_CHECK_INTERVAL;

    this.healthCheckInterval = setInterval(async () => {
      if (!this.currentConnection || !this.currentConnection.session) {
        logger.warn("Health check skipped: No active or open session.");
        if (
          statusManager.getServiceStatus(StatusConstants.OPCUA) ===
          StatusConstants.CONNECTED
        ) {
          logger.error(
            "OPC UA session found closed unexpectedly during health check.",
          );
          statusManager.setOpcuaStatus(StatusConstants.ERROR, {
            message: "Session closed unexpectedly",
          });
          await this.disconnectConnection();
          this.scheduleReconnect();
        }
        return;
      }

      try {
        const { session } = this.currentConnection;

        const nodeToRead = {
          nodeId: opcua.resolveNodeId("Server_ServerStatus_CurrentTime"),
          attributeId: opcua.AttributeIds.Value,
        };
        const dataValue = await session.read(nodeToRead);

        if (dataValue.statusCode.isGood()) {
          if (
            statusManager.getServiceStatus(StatusConstants.OPCUA) !==
            StatusConstants.CONNECTED
          ) {
            statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
              message: "Health check passed",
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          throw new Error(
            `Health check read failed with status: ${dataValue.statusCode.toString()}`,
          );
        }
      } catch (error: any) {
        logger.error("OPC UA health check failed:", {
          message: error.message,
          statusCode: error.statusCode ? error.statusCode.toString() : "N/A",
        });

        const isCritical =
          error.message.includes("BadSessionIdInvalid") ||
          error.message.includes("BadSessionClosed") ||
          error.message.includes("BadConnectionClosed") ||
          error.message.includes("Socket is closed") ||
          error.message.includes("Connection reset");

        if (isCritical) {
          statusManager.setOpcuaStatus(StatusConstants.ERROR, {
            message: "Health check failed: Connection lost",
            error: error.message,
          });
          await this.disconnectConnection();
          this.scheduleReconnect();
        } else {
          statusManager.setOpcuaStatus(StatusConstants.WARNING, {
            message: "Health check warning",
            error: error.message,
          });
        }
      }
    }, healthCheckIntervalMs);

    logger.info(
      `OPC UA health check scheduled every ${healthCheckIntervalMs / 1000} seconds`,
    );
  }

  async disconnectConnection(): Promise<void> {
    logger.info("Attempting to disconnect OPC UA connection...");
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.debug("Cleared health check interval.");
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      logger.debug("Cleared reconnect timer.");
    }

    this.isConnecting = true;

    if (this.currentConnection) {
      const { subscription, session, client } = this.currentConnection;
      this.currentConnection = null;

      const TIMEOUT_MS = 5000;

      try {
        if (subscription) {
          logger.debug("[Manager Shutdown] Terminating OPC UA subscription...");
          await Promise.race([
            subscription.terminate(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Subscription terminate timeout")),
                TIMEOUT_MS,
              ),
            ),
          ]);
          logger.debug(
            "[Manager Shutdown] Subscription terminated or timed out.",
          );
        }
      } catch (err: any) {
        logger.error(
          "[Manager Shutdown] Error/Timeout terminating subscription:",
          err.message,
        );
      }

      try {
        if (session) {
          logger.debug("[Manager Shutdown] Closing OPC UA session...");
          await Promise.race([
            session.close(true),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Session close timeout")),
                TIMEOUT_MS,
              ),
            ),
          ]);
          logger.debug("[Manager Shutdown] Session closed or timed out.");
        } else if (session) {
          logger.debug(
            "[Manager Shutdown] Session already closed or not open.",
          );
        } else {
          logger.debug("[Manager Shutdown] No session object found to close.");
        }
      } catch (err: any) {
        logger.error(
          "[Manager Shutdown] Error/Timeout closing session:",
          err.message,
        );
      }

      try {
        if (client) {
          logger.debug("[Manager Shutdown] Disconnecting OPC UA client...");
          await Promise.race([
            client.disconnect(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Client disconnect timeout")),
                TIMEOUT_MS,
              ),
            ),
          ]);
          logger.debug("[Manager Shutdown] Client disconnected or timed out.");
        } else {
          logger.debug(
            "[Manager Shutdown] No client object found to disconnect.",
          );
        }
      } catch (err: any) {
        logger.error(
          "[Manager Shutdown] Error/Timeout disconnecting client:",
          err.message,
        );
      }

      logger.info("[Manager Shutdown] OPC UA connection resources released.");
      statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, {
        message: "Connection intentionally closed",
        timestamp: new Date().toISOString(),
      });
      this.emit("disconnected");
    } else {
      logger.info(
        "[Manager Shutdown] No active OPC UA connection to disconnect.",
      );
      if (
        statusManager.getServiceStatus(StatusConstants.OPCUA) !==
        StatusConstants.DISCONNECTED
      ) {
        statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, {
          message: "No connection was active",
        });
      }
    }

    this.isConnecting = false;
    this.connectionAttempts = 0;
    this.retryDelay = 5000;
  }

  async updateConnection(
    newConfig: Partial<OpcuaConfig>,
  ): Promise<OpcuaConfig> {
    logger.info("Updating OPC UA connection configuration:", newConfig);
    this.currentConfig = {
      ...this.currentConfig,
      ...newConfig,
      securityMode:
        newConfig.securityMode !== undefined
          ? newConfig.securityMode
          : this.currentConfig.securityMode,
      securityPolicy:
        newConfig.securityPolicy !== undefined
          ? newConfig.securityPolicy
          : this.currentConfig.securityPolicy,
    };

    await this.disconnectConnection();
    this.connectionAttempts = 0;
    this.retryDelay = 5000;
    await this.startConnection();
    return this.getConnectionInfo().config;
  }

  getConnectionInfo(): ConnectionInfo {
    const status = statusManager.getServiceStatus(StatusConstants.OPCUA);
    const details = statusManager.getServiceDetails(StatusConstants.OPCUA);

    return {
      connected: status === StatusConstants.CONNECTED,
      status,
      statusText: StatusConstants.getStatusLabel(status),
      config: { ...this.currentConfig },
      securityMode:
        this.currentConnection?.securityMode || this.currentConfig.securityMode,
      securityPolicy:
        this.currentConnection?.securityPolicy ||
        this.currentConfig.securityPolicy,
      details: details || {},
      lastUpdated:
        details?.timestamp || statusManager.getFullStatus().lastUpdated,
    };
  }

  getSecurityOptions(): SecurityOptions {
    try {
      return {
        securityModes:
          opcuaClient.certificateManager.getAvailableSecurityModes(),
        securityPolicies:
          opcuaClient.certificateManager.getAvailableSecurityPolicies(),
      };
    } catch (error) {
      logger.error(
        "Failed to get security options from certificate manager:",
        error,
      );
      return {
        securityModes: ["None", "Sign", "SignAndEncrypt"],
        securityPolicies: ["None", "Basic256Sha256", "Aes128_Sha256_RsaOaep"],
      };
    }
  }

  async acceptCertificate(filename: string): Promise<boolean> {
    try {
      await opcuaClient.certificateManager.acceptRejectedCertificate(filename);
      logger.info(`Successfully accepted rejected certificate: ${filename}`);
      this.emit("certificateAccepted", {
        success: true,
        filename,
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (error: any) {
      logger.error(`Failed to accept rejected certificate ${filename}:`, error);
      this.emit("certificateError", {
        error: error.message,
        filename,
      });
      return false;
    }
  }

  async getConnectionPromise(
    endpointUrl: string,
    securityOptions: { securityMode?: string; securityPolicy?: string },
  ): Promise<any> {
    let testConnection: OpcuaConnectionResult | null = null;
    try {
      logger.info(
        `Testing connection to: ${endpointUrl} with SecurityMode=${securityOptions.securityMode}, SecurityPolicy=${securityOptions.securityPolicy}`,
      );

      testConnection = await opcuaClient.connectAndSubscribe(
        endpointUrl,
        securityOptions,
      );

      if (!testConnection) {
        throw new Error(
          "Test connection failed: connectAndSubscribe returned null",
        );
      }

      logger.info(`Test connection to ${endpointUrl} successful.`);
      return {
        success: true,
        securityMode: testConnection.securityMode,
        securityPolicy: testConnection.securityPolicy,
      };
    } catch (error: any) {
      logger.error(
        `Test connection to ${endpointUrl} failed: ${error.message}`,
      );
      throw error;
    } finally {
      if (testConnection) {
        try {
          if (testConnection.session) await testConnection.session.close();
          if (testConnection.client) await testConnection.client.disconnect();
          logger.debug(`Test connection to ${endpointUrl} cleaned up.`);
        } catch (cleanupError) {
          logger.error(
            `Error cleaning up test connection to ${endpointUrl}:`,
            cleanupError,
          );
        }
      }
    }
  }
}

const opcuaManager = new OpcuaConnectionManager();
export default opcuaManager;
