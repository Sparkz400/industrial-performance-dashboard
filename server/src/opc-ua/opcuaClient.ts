import { createMachineSession } from "../services/machineIdentity.js";
import * as opcua from "node-opcua";
import { EventEmitter } from "events";
import crypto from "crypto";
import opcuaMapping from "./config/opcuaMapping.js";
import type { OpcuaMappingConfig } from "./config/opcuaMapping.js";
import logger from "../utils/logger.js";
import StatusConstants from "../utils/statusConstants.js";
import statusManager from "../utils/status.js";
import certificateManager from "./services/certificateManager.js";
import config from "../config/config.js";
import { measurementIdentity } from "./measurementIdentity.js";
import type { SignalMetadata } from "@performance-dashboard/shared";

export interface OpcuaNodeData {
  key: string;
  label: string;
  value: number | string | boolean | null;
  timestamp: Date;
  sourceTimestamp?: Date | null;
  receivedAt?: Date;
  signalMetadata?: SignalMetadata;
  dataType: string;
  statusCode: string;
  machineId?: number;
}

export interface OpcuaConnectionResult {
  client: opcua.OPCUAClient;
  session: opcua.ClientSession;
  subscription: opcua.ClientSubscription;
  securityMode: string;
  securityPolicy: string;
}

class OPCUAEmitter extends EventEmitter {}
export const opcuaEmitter = new OPCUAEmitter();

/**
 * Publish untrusted certificates for explicit administrator review
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

      opcuaEmitter.emit("untrustedCertificate", {
        certificate: certificate.toString("base64"),
        serverUri: serverUri || "unknown_server",
        certificateHash,
        timestamp: new Date().toISOString(),
      });
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
  await certificateManager.ensureInitialized();
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

  await initializeCertificates();

  const securityMode =
    securityOptions.securityMode || config.OPCUA_SECURITY_MODE;
  const securityPolicy =
    securityOptions.securityPolicy || config.OPCUA_SECURITY_POLICY;

  while (retryCount < MAX_RETRIES) {
    let client: opcua.OPCUAClient | null = null;
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
      const metadataByKey = new Map<string, SignalMetadata>();
      client.on("connection_lost", () => {
        for (const [key, node] of Object.entries(
          dynamicMapping || opcuaMapping,
        )) {
          opcuaEmitter.emit("nodeChanged", {
            key,
            label: node.label,
            value: null,
            timestamp: new Date(),
            dataType: node.dataType,
            statusCode: "BadCommunicationError",
            machineId,
            receivedAt: new Date(),
            signalMetadata: metadataByKey.get(key),
          });
        }
      });
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
      const session = await createMachineSession(
        client,
        machineId,
        endpointUrl,
        securityMode,
      );
      const namespaces = await session.readNamespaceArray();
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
          let unit: string | null = null;
          // EngineeringUnits is optional; absence is unknown, never an inferred unit.
          try {
            const property = await session.translateBrowsePath(
              opcua.makeBrowsePath(nodeConfig.nodeId, "/0:EngineeringUnits"),
            );
            const unitNode = property.statusCode.isGood()
              ? property.targets?.[0]?.targetId
              : undefined;
            if (unitNode) {
              const result = await session.read({
                nodeId: unitNode,
                attributeId: opcua.AttributeIds.Value,
              });
              if (result.statusCode.isGood())
                unit = result.value.value?.displayName?.text ?? null;
            }
          } catch {
            logger.warn(
              `[ConnectAndSub] Engineering units unavailable for ${key}`,
            );
          }
          const metadata = measurementIdentity(
            endpointUrl,
            machineId,
            key,
            nodeConfig,
            namespaces,
            unit,
          );
          metadataByKey.set(key, metadata);
          const monitoredItem = opcua.ClientMonitoredItem.create(
            subscription,
            {
              nodeId: nodeConfig.nodeId,
              attributeId: opcua.AttributeIds.Value,
            },
            {
              samplingInterval: nodeConfig.samplingInterval ?? 500,
              discardOldest: true,
              queueSize: 10,
            },
            opcua.TimestampsToReturn.Both,
          );

          monitoredItem.on("changed", (dataValue: opcua.DataValue) => {
            opcuaEmitter.emit("nodeChanged", {
              key,
              label: nodeConfig.label,
              value: dataValue.value.value,
              timestamp: dataValue.serverTimestamp || new Date(),
              sourceTimestamp: dataValue.sourceTimestamp,
              receivedAt: new Date(),
              signalMetadata: metadata,
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

      // A read heartbeat provides fresh observations even when a monitored value stays constant.
      let reading = false;
      const heartbeat = setInterval(() => {
        if (reading) return;
        reading = true;
        const entries = Object.entries(activeMapping);
        void session
          .read(
            entries.map(([, mapping]) => ({
              nodeId: mapping.nodeId,
              attributeId: opcua.AttributeIds.Value,
            })),
            0,
          )
          .then((values) => {
            for (let i = 0; i < entries.length; i++) {
              const [key, mapping] = entries[i];
              const value = values[i];
              opcuaEmitter.emit("nodeChanged", {
                key,
                label: mapping.label,
                value: value.value.value ?? null,
                timestamp: new Date(),
                sourceTimestamp: value.sourceTimestamp,
                receivedAt: new Date(),
                signalMetadata: metadataByKey.get(key),
                dataType: mapping.dataType,
                statusCode: value.statusCode.toString(),
                machineId,
              });
            }
          })
          .catch((error) =>
            logger.warn(
              "OPC UA read heartbeat failed; coverage becomes unknown after the configured gap",
              error,
            ),
          )
          .finally(() => {
            reading = false;
          });
      }, 10000);
      subscription.once("terminated", () => clearInterval(heartbeat));
      session.once("session_closed", () => clearInterval(heartbeat));

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
