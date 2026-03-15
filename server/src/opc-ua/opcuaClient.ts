import opcua from "node-opcua";
import { EventEmitter } from "events";
import crypto from "crypto";
import opcuaMapping from "./config/opcuaMapping.js";
import type { OpcuaMappingConfig } from "./config/opcuaMapping.js";
import logger from "../utils/logger.js";
import StatusConstants from "../utils/statusConstants.js";
import statusManager from "../utils/status.js";
import certificateManager from "./services/certificateManager.js";
import config from "../config/config.js";

export interface OpcuaNodeData {
  key: string;
  label: string;
  value: any;
  timestamp: Date;
  dataType: string;
  statusCode: string;
  machineId?: number;
}

export interface OpcuaConnectionResult {
  client: any;
  session: any;
  subscription: any;
  securityMode: string;
  securityPolicy: string;
}

class OPCUAEmitter extends EventEmitter {}
export const opcuaEmitter = new OPCUAEmitter();

/**
 * Auto-accept untrusted certificates event handler
 */
opcuaEmitter.on(
  "serverCertificate",
  async (certificate: Buffer, serverUri: string) => {
    try {
      logger.info(
        `Received server certificate from ${serverUri || "unknown server"}`,
      );

      const certificateHash = crypto
        .createHash("sha256")
        .update(certificate)
        .digest("hex");

      if (config.AUTO_ACCEPT_CERTIFICATES) {
        const serverName = serverUri || "unknown_server";
        await certificateManager.trustCertificate(certificate, serverName);
        logger.info(
          `Auto-accepted certificate from ${serverName} (hash: ${certificateHash.substring(0, 16)}...)`,
        );

        opcuaEmitter.emit("certificateAccepted", {
          success: true,
          serverUri,
          certificateHash,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.warn(
          `Untrusted server certificate received from ${serverUri || "unknown server"}, waiting for manual acceptance`,
        );

        opcuaEmitter.emit("untrustedCertificate", {
          certificate: certificate.toString("base64"),
          serverUri: serverUri || "unknown_server",
          certificateHash: certificateHash,
          timestamp: new Date().toISOString(),
          filename: `${serverUri?.replace(/[^a-z0-9]/gi, "_") || "unknown"}_${Date.now()}.pem`,
        });
      }
    } catch (error: any) {
      logger.error("Error handling server certificate:", error);

      opcuaEmitter.emit("certificateError", {
        error: error.message,
        serverUri,
      });
    }
  },
);

/**
 * Initialize the certificate manager
 */
export async function initializeCertificates(): Promise<void> {
  try {
    await certificateManager.ensureInitialized();
  } catch (error: any) {
    logger.error("Failed to initialize certificates:", error);
    statusManager.setOpcuaStatus(StatusConstants.WARNING, {
      message:
        "Certificate initialization failed, falling back to insecure connection",
      error: error.message,
    });
  }
}

/**
 * Connect to OPC UA server and subscribe to nodes
 */
export async function connectAndSubscribe(
  endpointUrl: string,
  securityOptions: { securityMode?: string; securityPolicy?: string } = {},
  dynamicMapping?: OpcuaMappingConfig,
  machineId?: number,
): Promise<OpcuaConnectionResult | null> {
  const MAX_RETRIES = 3;
  let retryCount = 0;
  let lastError: Error | null = null;

  logger.info("[ConnectAndSub] Ensuring certificates are initialized...");
  try {
    await initializeCertificates();
    logger.info("[ConnectAndSub] Certificates initialization complete.");
  } catch (initErr: any) {
    logger.error(
      "[ConnectAndSub] Certificate initialization failed during connection attempt:",
      initErr,
    );
    statusManager.setOpcuaStatus(StatusConstants.WARNING, {
      message:
        "Certificate initialization failed, connection might be insecure or fail.",
      error: initErr.message,
    });
  }

  const securityMode =
    securityOptions.securityMode || config.OPCUA_SECURITY_MODE;
  const securityPolicy =
    securityOptions.securityPolicy || config.OPCUA_SECURITY_POLICY;

  while (retryCount < MAX_RETRIES) {
    let client: any = null;
    try {
      logger.info(
        `[ConnectAndSub Attempt ${retryCount + 1}] Getting client options... Mode: ${securityMode}, Policy: ${securityPolicy}`,
      );
      const clientOptions = await certificateManager.getClientOptions(
        securityMode,
        securityPolicy,
      );
      logger.debug(
        `[ConnectAndSub Attempt ${retryCount + 1}] Client Options:`,
        clientOptions,
      );

      client = opcua.OPCUAClient.create(clientOptions);
      logger.info(
        `[ConnectAndSub Attempt ${retryCount + 1}] Client created. Connecting to ${endpointUrl}...`,
      );

      const connectPromise = client.connect(endpointUrl);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error("Connection timeout after 30 seconds (client.connect)"),
            ),
          30000,
        );
      });

      await Promise.race([connectPromise, timeoutPromise]);
      logger.info(
        `[ConnectAndSub Attempt ${retryCount + 1}] Client connected successfully to ${endpointUrl}!`,
      );

      // Create session
      logger.info("[ConnectAndSub] Creating session...");
      const session = await client.createSession();
      logger.info("[ConnectAndSub] Session created successfully.");

      // Create subscription
      logger.info("[ConnectAndSub] Creating subscription...");
      const subscription = opcua.ClientSubscription.create(session, {
        requestedPublishingInterval: 500,
        requestedLifetimeCount: 100,
        requestedMaxKeepAliveCount: 10,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 1,
      });

      subscription.on("started", () => {
        logger.info(
          `[ConnectAndSub] Subscription started (ID: ${subscription.subscriptionId})`,
        );
      });

      subscription.on("terminated", () => {
        logger.warn("[ConnectAndSub] Subscription terminated.");
      });

      // Subscribe to all mapped nodes (use dynamic mapping if provided, else fallback to static)
      const activeMapping = dynamicMapping || opcuaMapping;
      for (const [key, nodeConfig] of Object.entries(activeMapping)) {
        try {
          const monitoredItem = opcua.ClientMonitoredItem.create(
            subscription,
            {
              nodeId: nodeConfig.nodeId,
              attributeId: opcua.AttributeIds.Value,
            },
            {
              samplingInterval: 500,
              discardOldest: true,
              queueSize: 10,
            },
            opcua.TimestampsToReturn.Both,
          );

          monitoredItem.on("changed", (dataValue: any) => {
            opcuaEmitter.emit("nodeChanged", {
              key,
              label: nodeConfig.label,
              value: dataValue.value.value,
              timestamp: dataValue.serverTimestamp || new Date(),
              dataType: nodeConfig.dataType,
              statusCode: dataValue.statusCode.toString(),
              machineId,
            } as OpcuaNodeData);
          });

          logger.info(
            `[ConnectAndSub] Monitoring node: ${key} (${nodeConfig.nodeId})`,
          );
        } catch (monitorErr: any) {
          logger.error(
            `[ConnectAndSub] Failed to monitor node ${key}: ${monitorErr.message}`,
          );
        }
      }

      return {
        client,
        session,
        subscription,
        securityMode: securityMode,
        securityPolicy: securityPolicy,
      };
    } catch (error: any) {
      lastError = error;
      retryCount++;
      logger.error(
        `[ConnectAndSub Attempt ${retryCount}] Connection failed: ${error.message}`,
      );
      logger.debug(
        `[ConnectAndSub Attempt ${retryCount}] Error stack: ${error.stack}`,
      );

      if (client) {
        try {
          logger.warn(
            `[ConnectAndSub Attempt ${retryCount}] Disconnecting client after error...`,
          );
          await client.disconnect();
        } catch (disconnectError: any) {
          logger.error(
            `[ConnectAndSub Attempt ${retryCount}] Error disconnecting client after connection error: ${disconnectError.message}`,
          );
        }
      }

      if (retryCount >= MAX_RETRIES) break;

      const delay = 2000 * retryCount;
      logger.warn(`[ConnectAndSub] Retrying connection in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  logger.error(
    `[ConnectAndSub] Failed to connect after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || "Unknown error"}.`,
  );
  statusManager.setOpcuaStatus(StatusConstants.ERROR, {
    message: "Connection failed after multiple attempts",
    error: lastError?.message || "Unknown error",
  });
  return null;
}

export { certificateManager };
