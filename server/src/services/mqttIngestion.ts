import { createHash } from "node:crypto";
import mqtt, { type MqttClient } from "mqtt";
import { eq } from "drizzle-orm";
import db from "../database/db.js";
import { mqttSources } from "../database/schema.js";
import { opcuaEmitter, type OpcuaNodeData } from "../opc-ua/opcuaClient.js";
import opcuaQueueWorker from "../queue/opcuaQueueWorker.js";
import { openMachineSecret } from "./machineIdentity.js";
import {
  MQTT_DATA_TYPES,
  createSparkplugState,
  parseSparkplugMessage,
  sparkplugStatus,
  sparkplugTopics,
  typedValue,
  type SparkplugMapping,
  type SparkplugState,
} from "./sparkplug.js";
import logger from "../utils/logger.js";

export { MQTT_DATA_TYPES };
export interface MqttMapping {
  topic: string;
  nodeKey: string;
  valuePointer: string;
  timestampPointer: string;
  dataType: (typeof MQTT_DATA_TYPES)[number];
}
export const MAX_PAYLOAD_BYTES = 16384;

/** Reads an RFC 6901 JSON pointer; undefined when any step is missing. */
export function jsonPointer(document: unknown, path: string): unknown {
  let node = document;
  if (path === "") return node;
  for (const raw of path.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      node === null ||
      typeof node !== "object" ||
      !Object.prototype.hasOwnProperty.call(node, key)
    )
      return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/**
 * One MQTT message becomes a measurement per mapping of its topic. A message without a
 * readable source timestamp is refused (no time, no sample); a value of the wrong type is
 * stored as a bad sample so the gap stays unknown. The event identity comes from source,
 * signal, time and value, so a broker redelivery is stored once.
 */
export function parseMessage(
  source: { id: number; machineId: number; brokerUrl: string },
  mappings: MqttMapping[],
  topic: string,
  payload: Buffer,
  receivedAt: Date,
): { measurements: OpcuaNodeData[]; rejected: string | null } {
  const matching = mappings.filter((m) => m.topic === topic);
  if (!matching.length) return { measurements: [], rejected: "Unmapped topic" };
  if (payload.length > MAX_PAYLOAD_BYTES)
    return { measurements: [], rejected: "Payload exceeds 16 KiB" };
  let document: unknown;
  try {
    document = JSON.parse(payload.toString("utf8"));
  } catch {
    return { measurements: [], rejected: "Payload is not JSON" };
  }
  const measurements: OpcuaNodeData[] = [];
  let rejected: string | null = null;
  for (const m of matching) {
    const rawTime = jsonPointer(document, m.timestampPointer);
    const time =
      typeof rawTime === "number"
        ? new Date(rawTime)
        : typeof rawTime === "string" &&
            /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(rawTime)
          ? new Date(rawTime)
          : null;
    if (!time || !Number.isFinite(time.getTime())) {
      rejected = `No source timestamp at ${m.timestampPointer || "/"} for ${m.nodeKey}`;
      continue;
    }
    const raw = jsonPointer(document, m.valuePointer);
    const value = typedValue(raw, m.dataType);
    measurements.push({
      machineId: source.machineId,
      key: m.nodeKey,
      label: m.nodeKey,
      value: value ?? null,
      timestamp: time,
      sourceTimestamp: time,
      receivedAt,
      dataType: m.dataType,
      statusCode: value === undefined ? "BadDecodingError" : "Good",
      signalMetadata: {
        signalId: `mqtt:${source.id}:${m.nodeKey}`,
        endpointUrl: source.brokerUrl,
        machineId: source.machineId,
        nodeId: `${topic}#${m.valuePointer}`,
        namespaceUri: source.brokerUrl,
        identifier: `${topic}#${m.valuePointer}`,
        mappingRevision: `mqtt:${source.id}`,
        unit: null,
      },
      eventId: `mqtt-${createHash("sha256")
        .update(
          JSON.stringify([
            source.id,
            m.nodeKey,
            time.toISOString(),
            raw ?? null,
          ]),
        )
        .digest("hex")}`,
      alreadySpooled: true,
    });
  }
  return { measurements, rejected };
}

export interface MqttSourceStatus {
  state: "connecting" | "connected" | "disconnected" | "error";
  lastMessageAt: string | null;
  accepted: number;
  rejected: number;
  lastRejection: string | null;
  lastError: string | null;
  /** Sparkplug B only: born, waiting for birth, sequence gap or offline per node/device. */
  sparkplug?: Record<string, string>;
}

/**
 * Read-only MQTT subscribers of the collector. Only exact mapped topics (and, for Sparkplug B,
 * the device messages of mapped edge nodes) are subscribed (QoS 1, persistent session) and
 * nothing is ever published. A message is acknowledged to the broker only after its
 * measurements are in the durable spool, so a storage failure leaves it for redelivery.
 */
class MqttIngestion {
  private clients = new Map<
    number,
    {
      client: MqttClient | null;
      status: MqttSourceStatus;
      sparkplug?: { state: SparkplugState; mappings: SparkplugMapping[] };
    }
  >();
  running = false;

  async startAll() {
    this.running = true;
    const rows = await db
      .select()
      .from(mqttSources)
      .where(eq(mqttSources.isActive, true));
    for (const row of rows) await this.start(row);
  }

  /** Applies a changed or new source while the collector runs. */
  async reload(id: number) {
    if (!this.running) return;
    await this.stop(id);
    const [row] = await db
      .select()
      .from(mqttSources)
      .where(eq(mqttSources.id, id));
    if (row?.isActive) await this.start(row);
  }

  async start(row: typeof mqttSources.$inferSelect) {
    const mappings = row.mappings as MqttMapping[];
    const sparkplug =
      row.payloadFormat === "sparkplug-b"
        ? {
            mappings: row.mappings as SparkplugMapping[],
            state: createSparkplugState(row.mappings as SparkplugMapping[]),
          }
        : undefined;
    const status: MqttSourceStatus = {
      state: "connecting",
      lastMessageAt: null,
      accepted: 0,
      rejected: 0,
      lastRejection: null,
      lastError: null,
    };
    let password: string | undefined;
    try {
      password = row.encryptedPassword
        ? (await openMachineSecret(row.machineId, row.encryptedPassword))
            .password
        : undefined;
    } catch (error) {
      status.state = "error";
      status.lastError = error instanceof Error ? error.message : String(error);
      this.clients.set(row.id, { client: null, status });
      return;
    }
    const client = mqtt.connect(row.brokerUrl, {
      protocolVersion: 4,
      clientId: row.clientId,
      clean: false,
      username: row.username ?? undefined,
      password,
      // Node's TLS client already refuses anything older than TLS 1.2.
      ca: [row.caCertificate],
      rejectUnauthorized: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });
    client.handleMessage = (packet, callback) => {
      const { measurements, rejected } = sparkplug
        ? parseSparkplugMessage(
            row,
            sparkplug.mappings,
            sparkplug.state,
            packet.topic,
            Buffer.from(packet.payload),
            new Date(),
          )
        : parseMessage(
            row,
            mappings,
            packet.topic,
            Buffer.from(packet.payload),
            new Date(),
          );
      try {
        for (const m of measurements) opcuaQueueWorker.enqueue(m);
      } catch (error) {
        // Not acknowledged: the broker redelivers once storage recovers.
        status.lastError =
          error instanceof Error ? error.message : String(error);
        return callback(error as Error);
      }
      status.lastMessageAt = new Date().toISOString();
      status.accepted += measurements.length;
      if (rejected) {
        status.rejected++;
        status.lastRejection = rejected;
      }
      for (const m of measurements) opcuaEmitter.emit("nodeChanged", m);
      callback();
    };
    client.on("connect", () => {
      status.state = "connected";
      status.lastError = null;
      client.subscribe(
        sparkplug
          ? sparkplugTopics(sparkplug.mappings)
          : [...new Set(mappings.map((m) => m.topic))],
        { qos: 1 },
        (error, granted) => {
          const refused = granted?.filter((g) => g.qos === 128) ?? [];
          if (error || refused.length)
            status.lastError = error
              ? error.message
              : `Broker refused ${refused.map((g) => g.topic).join(", ")}`;
        },
      );
    });
    client.on("reconnect", () => (status.state = "connecting"));
    client.on("close", () => {
      if (status.state !== "error") status.state = "disconnected";
    });
    client.on("error", (error) => {
      status.state = "error";
      status.lastError = error.message;
      logger.warn(`[MQTT] Source ${row.id}: ${error.message}`);
    });
    this.clients.set(row.id, { client, status, sparkplug });
  }

  async stop(id: number) {
    const entry = this.clients.get(id);
    this.clients.delete(id);
    await entry?.client?.endAsync(true);
  }

  async stopAll() {
    this.running = false;
    for (const id of [...this.clients.keys()]) await this.stop(id);
  }

  status(id: number): MqttSourceStatus | null {
    const entry = this.clients.get(id);
    if (!entry?.sparkplug) return entry?.status ?? null;
    return {
      ...entry.status,
      sparkplug: sparkplugStatus(
        entry.sparkplug.state,
        entry.sparkplug.mappings,
      ),
    };
  }
}

export const mqttIngestion = new MqttIngestion();
