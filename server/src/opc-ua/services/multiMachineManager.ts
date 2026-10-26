import { createMachineSession } from "../../services/machineIdentity.js";
import { EventEmitter } from "events";
import { eq, and } from "drizzle-orm";
import * as opcua from "node-opcua";
import * as opcuaClient from "../opcuaClient.js";
import logger from "../../utils/logger.js";
import db from "../../database/db.js";
import {
  machines,
  nodeMappings,
  type Machine,
  type NodeMapping,
} from "../../database/schema.js";
import type { OpcuaMappingConfig } from "../config/opcuaMapping.js";
import type { OpcuaConnectionResult } from "../opcuaClient.js";

export type { Machine as MachineRecord, NodeMapping as NodeMappingRecord };

export interface BrowsedNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  isForward: boolean;
}

interface MachineConnection {
  machine: Machine;
  connection: OpcuaConnectionResult | null;
  healthCheckInterval: ReturnType<typeof setInterval> | null;
}

class MultiMachineManager extends EventEmitter {
  private connections: Map<number, MachineConnection> = new Map();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const activeMachines = await db
        .select()
        .from(machines)
        .where(eq(machines.isActive, true));

      if (activeMachines.length === 0) {
        logger.info(
          "[MultiMachine] No active machines configured. Use /machines API to add machines.",
        );
        this.isInitialized = true;
        return;
      }

      logger.info(
        `[MultiMachine] Found ${activeMachines.length} active machine(s). Starting connections...`,
      );

      for (const machine of activeMachines) {
        try {
          await this.connectMachine(machine);
        } catch (err: any) {
          logger.error(
            `[MultiMachine] Failed to connect machine ${machine.name} (${machine.id}): ${err.message}`,
          );
        }
      }

      this.isInitialized = true;
    } catch (err: any) {
      logger.error(`[MultiMachine] Initialization failed: ${err.message}`);
      this.isInitialized = true;
    }
  }

  async connectMachine(machine: Machine): Promise<void> {
    const existing = this.connections.get(machine.id);
    if (existing?.connection) {
      logger.info(
        `[MultiMachine] Machine ${machine.name} already connected. Disconnecting first.`,
      );
      await this.disconnectMachine(machine.id);
    }

    const mappingsList = await this.getNodeMappingsForMachine(machine.id);

    if (mappingsList.length === 0) {
      logger.info(
        `[MultiMachine] Machine ${machine.name} has no active node mappings. Skipping connection.`,
      );
      await this.updateMachineStatus(machine.id, "no_mappings");
      return;
    }

    const dynamicMapping: OpcuaMappingConfig = {};
    for (const m of mappingsList) {
      dynamicMapping[m.nodeKey] = {
        nodeId: m.nodeId,
        dataType: m.dataType ?? "Double",
        label: m.displayName,
        samplingInterval: m.samplingInterval ?? 500,
      };
    }

    const endpointUrl = machine.endpointUrl;
    const securityOptions = {
      securityMode: machine.securityMode ?? "None",
      securityPolicy: machine.securityPolicy ?? "None",
    };

    logger.info(
      `[MultiMachine] Connecting to machine ${machine.name} at ${endpointUrl}...`,
    );
    await this.updateMachineStatus(machine.id, "connecting");

    try {
      const connection = await opcuaClient.connectAndSubscribe(
        endpointUrl,
        securityOptions,
        dynamicMapping,
        machine.id,
      );

      if (connection) {
        const healthCheckInterval = setInterval(async () => {
          await this.healthCheck(machine.id);
        }, 30000);

        this.connections.set(machine.id, {
          machine,
          connection,
          healthCheckInterval,
        });

        await this.updateMachineStatus(machine.id, "connected");
        logger.info(
          `[MultiMachine] Machine ${machine.name} connected successfully.`,
        );
        this.emit("machineConnected", {
          machineId: machine.id,
          name: machine.name,
        });
      } else {
        await this.updateMachineStatus(machine.id, "error");
        logger.error(
          `[MultiMachine] Machine ${machine.name} connection returned null.`,
        );
      }
    } catch (err: any) {
      await this.updateMachineStatus(machine.id, "error");
      logger.error(
        `[MultiMachine] Machine ${machine.name} connection failed: ${err.message}`,
      );
      throw err;
    }
  }

  async disconnectMachine(machineId: number): Promise<void> {
    const entry = this.connections.get(machineId);
    if (!entry) return;

    if (entry.healthCheckInterval) {
      clearInterval(entry.healthCheckInterval);
    }

    if (entry.connection) {
      try {
        if (entry.connection.subscription) {
          await entry.connection.subscription.terminate().catch(() => {});
        }
        if (entry.connection.session) {
          await entry.connection.session.close(true).catch(() => {});
        }
        if (entry.connection.client) {
          await entry.connection.client.disconnect().catch(() => {});
        }
      } catch (err: any) {
        logger.error(
          `[MultiMachine] Error disconnecting machine ${machineId}: ${err.message}`,
        );
      }
    }

    this.connections.delete(machineId);
    await this.updateMachineStatus(machineId, "disconnected");
    this.emit("machineDisconnected", { machineId });
  }

  async disconnectAll(): Promise<void> {
    const machineIds = Array.from(this.connections.keys());
    for (const id of machineIds) {
      await this.disconnectMachine(id);
    }
  }

  private async healthCheck(machineId: number): Promise<void> {
    const entry = this.connections.get(machineId);
    if (!entry?.connection?.session) {
      logger.warn(
        `[MultiMachine] Health check: Machine ${machineId} session not open.`,
      );
      await this.updateMachineStatus(machineId, "error");
      return;
    }

    try {
      const nodeToRead = {
        nodeId: opcua.resolveNodeId("Server_ServerStatus_CurrentTime"),
        attributeId: opcua.AttributeIds.Value,
      };
      const dataValue = await entry.connection.session.read(nodeToRead);

      if (!dataValue.statusCode.isGood()) {
        throw new Error(
          `Health check failed: ${dataValue.statusCode.toString()}`,
        );
      }
    } catch (err: any) {
      logger.error(
        `[MultiMachine] Health check failed for machine ${machineId}: ${err.message}`,
      );

      const isCritical =
        err.message.includes("BadSessionIdInvalid") ||
        err.message.includes("BadSessionClosed") ||
        err.message.includes("BadConnectionClosed") ||
        err.message.includes("Socket is closed");

      if (isCritical) {
        await this.updateMachineStatus(machineId, "error");
        await this.disconnectMachine(machineId);

        // Attempt reconnect
        try {
          const result = await db
            .select()
            .from(machines)
            .where(eq(machines.id, machineId));

          if (result.length > 0 && result[0].isActive) {
            setTimeout(() => {
              this.connectMachine(result[0]).catch((e: any) => {
                logger.error(
                  `[MultiMachine] Reconnect failed for machine ${machineId}: ${e.message}`,
                );
              });
            }, 5000);
          }
        } catch (dbErr: any) {
          logger.error(
            `[MultiMachine] Failed to fetch machine for reconnect: ${dbErr.message}`,
          );
        }
      }
    }
  }

  async browseNodes(
    machineId: number,
    parentNodeId?: string,
  ): Promise<BrowsedNode[]> {
    const entry = this.connections.get(machineId);

    // If not connected, do a temporary connection for browsing
    let session: opcua.ClientSession | null = null;
    let tempClient: opcua.OPCUAClient | null = null;
    let useTempConnection = false;

    try {
      if (entry?.connection?.session) {
        session = entry.connection.session;
      } else {
        // Create temp connection just for browsing
        const result = await db
          .select()
          .from(machines)
          .where(eq(machines.id, machineId));

        if (result.length === 0) throw new Error("Machine not found");

        const machine = result[0];
        const clientOptions =
          await opcuaClient.certificateManager.getClientOptions(
            machine.securityMode ?? "None",
            machine.securityPolicy ?? "None",
          );

        tempClient = opcua.OPCUAClient.create(clientOptions);
        useTempConnection = true;
        await tempClient.connect(machine.endpointUrl);
        session = await createMachineSession(
          tempClient,
          machineId,
          machine.endpointUrl,
          machine.securityMode ?? "None",
        );
      }

      const browseResult = await session.browse({
        nodeId: parentNodeId || "RootFolder",
        browseDirection: opcua.BrowseDirection.Forward,
        resultMask: 0x3f,
        referenceTypeId: "HierarchicalReferences",
        includeSubtypes: true,
      });

      const nodes: BrowsedNode[] = (browseResult.references || []).map(
        (ref: opcua.ReferenceDescription) => ({
          nodeId: ref.nodeId.toString(),
          browseName: ref.browseName.toString(),
          displayName: ref.displayName?.text || ref.browseName.toString(),
          nodeClass: opcua.NodeClass[ref.nodeClass] || "Unknown",
          isForward: ref.isForward,
        }),
      );

      return nodes;
    } finally {
      if (useTempConnection) {
        try {
          try {
            if (session) await session.close();
          } finally {
            if (tempClient) await tempClient.disconnect();
          }
        } catch (e) {
          logger.error(
            "[MultiMachine] Error closing temp browse connection:",
            e,
          );
        }
      }
    }
  }

  async getNodeMappingsForMachine(machineId: number): Promise<NodeMapping[]> {
    return db
      .select()
      .from(nodeMappings)
      .where(
        and(
          eq(nodeMappings.machineId, machineId),
          eq(nodeMappings.isActive, true),
        ),
      )
      .orderBy(nodeMappings.nodeKey);
  }

  private async updateMachineStatus(
    machineId: number,
    status: string,
  ): Promise<void> {
    try {
      await db
        .update(machines)
        .set({ status, updatedAt: new Date() })
        .where(eq(machines.id, machineId));

      this.emit("machineStatusChanged", { machineId, status });
    } catch (err: any) {
      logger.error(
        `[MultiMachine] Failed to update machine ${machineId} status: ${err.message}`,
      );
    }
  }

  getMachineConnection(machineId: number): MachineConnection | undefined {
    return this.connections.get(machineId);
  }

  getConnectedMachineIds(): number[] {
    return Array.from(this.connections.keys()).filter((id) => {
      const entry = this.connections.get(id);
      return (
        entry?.connection?.session && !entry.connection.client.isReconnecting
      );
    });
  }

  async refreshMachineConnection(machineId: number): Promise<void> {
    const result = await db
      .select()
      .from(machines)
      .where(eq(machines.id, machineId));

    if (result.length === 0) throw new Error("Machine not found");

    const machine = result[0];
    if (!machine.isActive) {
      await this.disconnectMachine(machineId);
      return;
    }

    await this.connectMachine(machine);
  }
}

const multiMachineManager = new MultiMachineManager();
export default multiMachineManager;
