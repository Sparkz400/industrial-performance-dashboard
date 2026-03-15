import { EventEmitter } from "events";
import opcua from "node-opcua";
import * as opcuaClient from "../opcuaClient.js";
import logger from "../../utils/logger.js";
import dbClient from "../../database/dbConnection.js";
import type { OpcuaMappingConfig } from "../config/opcuaMapping.js";
import type { OpcuaConnectionResult } from "../opcuaClient.js";

export interface MachineRecord {
  id: number;
  name: string;
  endpoint_url: string;
  ip: string;
  port: number;
  resource_path: string;
  security_mode: string;
  security_policy: string;
  is_active: boolean;
  status: string;
}

export interface NodeMappingRecord {
  id: number;
  machine_id: number;
  node_id: string;
  node_key: string;
  display_name: string;
  data_type: string;
  sampling_interval: number;
  is_active: boolean;
}

export interface BrowsedNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  isForward: boolean;
}

interface MachineConnection {
  machine: MachineRecord;
  connection: OpcuaConnectionResult | null;
  healthCheckInterval: ReturnType<typeof setInterval> | null;
}

class MultiMachineManager extends EventEmitter {
  private connections: Map<number, MachineConnection> = new Map();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const result = await dbClient.query(
        "SELECT * FROM machines WHERE is_active = true",
      );
      const machines: MachineRecord[] = result.rows;

      if (machines.length === 0) {
        logger.info(
          "[MultiMachine] No active machines configured. Use /machines API to add machines.",
        );
        this.isInitialized = true;
        return;
      }

      logger.info(
        `[MultiMachine] Found ${machines.length} active machine(s). Starting connections...`,
      );

      for (const machine of machines) {
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

  async connectMachine(machine: MachineRecord): Promise<void> {
    const existing = this.connections.get(machine.id);
    if (existing?.connection) {
      logger.info(
        `[MultiMachine] Machine ${machine.name} already connected. Disconnecting first.`,
      );
      await this.disconnectMachine(machine.id);
    }

    const mappings = await this.getNodeMappingsForMachine(machine.id);

    if (mappings.length === 0) {
      logger.info(
        `[MultiMachine] Machine ${machine.name} has no active node mappings. Skipping connection.`,
      );
      await this.updateMachineStatus(machine.id, "no_mappings");
      return;
    }

    const dynamicMapping: OpcuaMappingConfig = {};
    for (const m of mappings) {
      dynamicMapping[m.node_key] = {
        nodeId: m.node_id,
        dataType: m.data_type,
        label: m.display_name,
      };
    }

    const endpointUrl = machine.endpoint_url;
    const securityOptions = {
      securityMode: machine.security_mode,
      securityPolicy: machine.security_policy,
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
        if (entry.connection.session?.isOpen) {
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
    if (!entry?.connection?.session?.isOpen) {
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
          const result = await dbClient.query(
            "SELECT * FROM machines WHERE id = $1",
            [machineId],
          );
          if (result.rows.length > 0 && result.rows[0].is_active) {
            setTimeout(() => {
              this.connectMachine(result.rows[0]).catch((e: any) => {
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
    let session: any;
    let tempClient: any;
    let useTempConnection = false;

    if (entry?.connection?.session?.isOpen) {
      session = entry.connection.session;
    } else {
      // Create temp connection just for browsing
      const result = await dbClient.query(
        "SELECT * FROM machines WHERE id = $1",
        [machineId],
      );
      if (result.rows.length === 0) throw new Error("Machine not found");

      const machine = result.rows[0] as MachineRecord;
      const clientOptions =
        await opcuaClient.certificateManager.getClientOptions(
          machine.security_mode,
          machine.security_policy,
        );

      tempClient = opcua.OPCUAClient.create(clientOptions);
      await tempClient.connect(machine.endpoint_url);
      session = await tempClient.createSession();
      useTempConnection = true;
    }

    try {
      const browseResult = await session.browse({
        nodeId: parentNodeId || "RootFolder",
        browseDirection: opcua.BrowseDirection.Forward,
        resultMask: 0x3f,
        referenceTypeId: "HierarchicalReferences",
        includeSubtypes: true,
      });

      const nodes: BrowsedNode[] = (browseResult.references || []).map(
        (ref: any) => ({
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
          if (session) await session.close();
          if (tempClient) await tempClient.disconnect();
        } catch (e) {
          logger.error(
            "[MultiMachine] Error closing temp browse connection:",
            e,
          );
        }
      }
    }
  }

  async getNodeMappingsForMachine(
    machineId: number,
  ): Promise<NodeMappingRecord[]> {
    const result = await dbClient.query(
      "SELECT * FROM node_mappings WHERE machine_id = $1 AND is_active = true ORDER BY node_key",
      [machineId],
    );
    return result.rows;
  }

  private async updateMachineStatus(
    machineId: number,
    status: string,
  ): Promise<void> {
    try {
      await dbClient.query(
        "UPDATE machines SET status = $1, updated_at = NOW() WHERE id = $2",
        [status, machineId],
      );
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
      return entry?.connection?.session?.isOpen;
    });
  }

  async refreshMachineConnection(machineId: number): Promise<void> {
    const result = await dbClient.query(
      "SELECT * FROM machines WHERE id = $1",
      [machineId],
    );
    if (result.rows.length === 0) throw new Error("Machine not found");

    const machine = result.rows[0] as MachineRecord;
    if (!machine.is_active) {
      await this.disconnectMachine(machineId);
      return;
    }

    await this.connectMachine(machine);
  }
}

const multiMachineManager = new MultiMachineManager();
export default multiMachineManager;
