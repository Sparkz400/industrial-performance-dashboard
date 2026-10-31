import { createHash } from "node:crypto";
import type { OpcuaNodeData } from "../opc-ua/opcuaClient.js";

export const MQTT_DATA_TYPES = [
  "Boolean",
  "Int16",
  "UInt16",
  "Int32",
  "UInt32",
  "Float",
  "Double",
] as const;
export type MqttDataType = (typeof MQTT_DATA_TYPES)[number];
const INTEGER_RANGES: Record<string, [number, number]> = {
  Int16: [-32768, 32767],
  UInt16: [0, 65535],
  Int32: [-2147483648, 2147483647],
  UInt32: [0, 4294967295],
};

export function typedValue(raw: unknown, type: MqttDataType) {
  if (type === "Boolean") return typeof raw === "boolean" ? raw : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const range = INTEGER_RANGES[type];
  if (range && (!Number.isInteger(raw) || raw < range[0] || raw > range[1]))
    return undefined;
  return raw;
}

// A birth certificate lists every metric of a node, so it is far larger than one JSON reading.
export const MAX_SPARKPLUG_PAYLOAD_BYTES = 262144;

/** One Sparkplug B metric of an edge node (deviceId null) or one of its devices. */
export interface SparkplugMapping {
  groupId: string;
  edgeNodeId: string;
  deviceId: string | null;
  metric: string;
  nodeKey: string;
  dataType: MqttDataType;
}

type MetricValue =
  | { kind: "int"; raw: number }
  | { kind: "long"; raw: bigint }
  | { kind: "float"; raw: number }
  | { kind: "boolean"; raw: boolean }
  | { kind: "string"; raw: string }
  | { kind: "unsupported" };

export interface SparkplugMetric {
  name: string | null;
  /** uint64 alias as a decimal string. */
  alias: string | null;
  timestamp: number | null;
  datatype: number | null;
  isHistorical: boolean;
  isNull: boolean;
  value: MetricValue | null;
}

export interface SparkplugPayload {
  timestamp: number | null;
  seq: number | null;
  metrics: SparkplugMetric[];
}

type Field = { field: number; wire: number; value: bigint | Buffer };

/** Protocol Buffers wire format: varint, 64-bit, length-delimited and 32-bit fields. */
function* fields(buffer: Buffer): Generator<Field> {
  let at = 0;
  const varint = () => {
    let result = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (at >= buffer.length) throw new Error("Truncated varint");
      const byte = buffer[at++];
      result |= BigInt(byte & 0x7f) << shift;
      if (byte < 0x80) return BigInt.asUintN(64, result);
    }
    throw new Error("Varint is longer than 10 bytes");
  };
  const take = (length: number) => {
    if (length > buffer.length - at) throw new Error("Truncated field");
    return buffer.subarray(at, (at += length));
  };
  while (at < buffer.length) {
    const tag = varint();
    const field = Number(tag >> 3n),
      wire = Number(tag & 7n);
    if (field === 0) throw new Error("Field number 0");
    if (wire === 0) yield { field, wire, value: varint() };
    else if (wire === 1) yield { field, wire, value: take(8) };
    else if (wire === 2) yield { field, wire, value: take(Number(varint())) };
    else if (wire === 5) yield { field, wire, value: take(4) };
    else throw new Error(`Unsupported wire type ${wire}`);
  }
}

const wired = (f: Field, wire: number) => {
  if (f.wire !== wire)
    throw new Error(`Field ${f.field} has wire type ${f.wire}`);
  return f.value;
};
const uint = (f: Field) => wired(f, 0) as bigint;
const utf8 = (f: Field) =>
  new TextDecoder("utf-8", { fatal: true }).decode(wired(f, 2) as Buffer);
const millis = (f: Field) => {
  const value = uint(f);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Timestamp out of range");
  return Number(value);
};

function decodeMetric(buffer: Buffer): SparkplugMetric {
  const metric: SparkplugMetric = {
    name: null,
    alias: null,
    timestamp: null,
    datatype: null,
    isHistorical: false,
    isNull: false,
    value: null,
  };
  for (const f of fields(buffer)) {
    switch (f.field) {
      case 1:
        metric.name = utf8(f);
        break;
      case 2:
        metric.alias = uint(f).toString();
        break;
      case 3:
        metric.timestamp = millis(f);
        break;
      case 4:
        metric.datatype = Number(BigInt.asUintN(32, uint(f)));
        break;
      case 5:
        metric.isHistorical = uint(f) !== 0n;
        break;
      case 7:
        metric.isNull = uint(f) !== 0n;
        break;
      case 10:
        metric.value = {
          kind: "int",
          raw: Number(BigInt.asUintN(32, uint(f))),
        };
        break;
      case 11:
        metric.value = { kind: "long", raw: uint(f) };
        break;
      case 12:
        metric.value = {
          kind: "float",
          raw: (wired(f, 5) as Buffer).readFloatLE(0),
        };
        break;
      case 13:
        metric.value = {
          kind: "float",
          raw: (wired(f, 1) as Buffer).readDoubleLE(0),
        };
        break;
      case 14:
        metric.value = { kind: "boolean", raw: uint(f) !== 0n };
        break;
      case 15:
        metric.value = { kind: "string", raw: utf8(f) };
        break;
      case 16:
      case 17:
      case 18:
      case 19:
        metric.value = { kind: "unsupported" }; // bytes, dataset, template, extension
        break;
    }
  }
  return metric;
}

/** Decodes the scalar parts of a Sparkplug B Payload; throws on malformed input. */
export function decodeSparkplugPayload(buffer: Buffer): SparkplugPayload {
  const payload: SparkplugPayload = { timestamp: null, seq: null, metrics: [] };
  for (const f of fields(buffer)) {
    if (f.field === 1) payload.timestamp = millis(f);
    else if (f.field === 2)
      payload.metrics.push(decodeMetric(wired(f, 2) as Buffer));
    else if (f.field === 3) {
      const seq = uint(f);
      if (seq > 255n) throw new Error("Sequence number above 255");
      payload.seq = Number(seq);
    }
  }
  return payload;
}

// Sparkplug datatype numbers equivalent to the dashboard's declared types.
const SPARKPLUG_TYPE: Record<MqttDataType, number> = {
  Int16: 2,
  Int32: 3,
  UInt16: 6,
  UInt32: 7,
  Float: 9,
  Double: 10,
  Boolean: 11,
};

/** A metric value per its Sparkplug datatype; undefined when it cannot be read exactly. */
export function metricValue(
  value: MetricValue,
  datatype: number,
): number | boolean | string | undefined {
  if (value.kind === "int") {
    const raw = value.raw;
    const bits = datatype === 1 ? 8 : datatype === 2 ? 16 : 0;
    if (bits) {
      // Sparkplug 3.0 stores the 32-bit two's complement; older encoders used the narrow width.
      const signed =
        raw >= 2 ** (bits - 1) && raw < 2 ** bits ? raw - 2 ** bits : raw | 0;
      return signed >= -(2 ** (bits - 1)) && signed < 2 ** (bits - 1)
        ? signed
        : undefined;
    }
    if (datatype === 3) return raw | 0;
    if (datatype === 5) return raw <= 0xff ? raw : undefined;
    if (datatype === 6) return raw <= 0xffff ? raw : undefined;
    return datatype === 7 ? raw : undefined;
  }
  if (value.kind === "long") {
    const n =
      datatype === 4
        ? BigInt.asIntN(64, value.raw)
        : datatype === 8
          ? value.raw
          : null;
    return n !== null &&
      n >= BigInt(Number.MIN_SAFE_INTEGER) &&
      n <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(n)
      : undefined;
  }
  if (value.kind === "float")
    return datatype === 9 || datatype === 10 ? value.raw : undefined;
  if (value.kind === "boolean") return datatype === 11 ? value.raw : undefined;
  if (value.kind === "string") return value.raw;
  return undefined;
}

type Waiting = "birth" | "sequence gap" | "death";
interface Scope {
  /** alias → name from the latest birth; null until a birth or after a gap/death. */
  aliases: Map<string, string> | null;
  /** name → datatype, kept across gaps because metric names are stable identities. */
  types: Map<string, number>;
  waiting: Waiting | null;
}
interface NodeState {
  bdSeq: bigint | null;
  seq: number | null;
  node: Scope;
  devices: Map<string, Scope>;
}
/** In-memory view of each mapped edge node, keyed group/edgeNode; lost on restart. */
export type SparkplugState = Map<string, NodeState>;

const unborn = (): Scope => ({
  aliases: null,
  types: new Map(),
  waiting: "birth",
});

export function createSparkplugState(
  mappings: SparkplugMapping[],
): SparkplugState {
  const state: SparkplugState = new Map();
  for (const m of mappings) {
    const key = `${m.groupId}/${m.edgeNodeId}`;
    const node = state.get(key) ?? {
      bdSeq: null,
      seq: null,
      node: unborn(),
      devices: new Map(),
    };
    if (m.deviceId !== null && !node.devices.has(m.deviceId))
      node.devices.set(m.deviceId, unborn());
    state.set(key, node);
  }
  return state;
}

/**
 * Exact birth/data/death topics of each mapped edge node. Device messages use a single-level
 * wildcard: the node's sequence number counts every device, so a gap is detectable only
 * when all of them are read. Nothing is ever published (no STATE, no rebirth request).
 */
export function sparkplugTopics(mappings: SparkplugMapping[]) {
  const topics = new Set<string>();
  for (const { groupId, edgeNodeId } of mappings) {
    for (const type of ["NBIRTH", "NDATA", "NDEATH"])
      topics.add(`spBv1.0/${groupId}/${type}/${edgeNodeId}`);
    for (const type of ["DBIRTH", "DDATA", "DDEATH"])
      topics.add(`spBv1.0/${groupId}/${type}/${edgeNodeId}/+`);
  }
  return [...topics];
}

/** born, waiting for birth, sequence gap or offline for each mapped node and device. */
export function sparkplugStatus(
  state: SparkplugState,
  mappings: SparkplugMapping[],
) {
  const label = (scope: Scope) =>
    scope.aliases
      ? "born"
      : scope.waiting === "death"
        ? "offline"
        : scope.waiting === "sequence gap"
          ? "sequence gap"
          : "waiting for birth";
  const status: Record<string, string> = {};
  for (const m of mappings) {
    const node = state.get(`${m.groupId}/${m.edgeNodeId}`)!;
    const scope =
      m.deviceId === null ? node.node : node.devices.get(m.deviceId)!;
    status[
      `${m.groupId}/${m.edgeNodeId}${m.deviceId === null ? "" : `/${m.deviceId}`}`
    ] = label(scope);
  }
  return status;
}

const MESSAGE_TYPES = new Set([
  "NBIRTH",
  "NDATA",
  "NDEATH",
  "DBIRTH",
  "DDATA",
  "DDEATH",
]);

function born(scope: Scope, metrics: SparkplugMetric[]) {
  scope.aliases = new Map();
  scope.types = new Map();
  scope.waiting = null;
  for (const m of metrics) {
    if (m.name === null) continue;
    if (m.alias !== null) scope.aliases.set(m.alias, m.name);
    if (m.datatype !== null) scope.types.set(m.name, m.datatype);
  }
}

function lose(scope: Scope, waiting: Waiting) {
  scope.aliases = null;
  scope.waiting = waiting;
}

function birthSequence(payload: SparkplugPayload) {
  const value = payload.metrics.find((m) => m.name === "bdSeq")?.value;
  return value?.kind === "long"
    ? value.raw
    : value?.kind === "int"
      ? BigInt(value.raw)
      : null;
}

/** Tracks the node's 0–255 message sequence; a skipped number may hide a missed birth. */
function sequence(node: NodeState, seq: number | null) {
  const last = node.seq;
  node.seq = seq;
  if (
    last === null ||
    (seq !== null && (seq === last || seq === (last + 1) % 256))
  )
    return;
  for (const scope of [node.node, ...node.devices.values()])
    if (scope.aliases) lose(scope, "sequence gap");
}

const scopeId = (m: SparkplugMapping) =>
  `spBv1.0/${m.groupId}/${m.edgeNodeId}${m.deviceId === null ? "" : `/${m.deviceId}`}`;

function measurement(
  source: { id: number; machineId: number; brokerUrl: string },
  m: SparkplugMapping,
  time: Date,
  receivedAt: Date,
  value: number | boolean | null,
  statusCode: string,
  identity: unknown[],
): OpcuaNodeData {
  const identifier = `${scopeId(m)}#${m.metric}`;
  return {
    machineId: source.machineId,
    key: m.nodeKey,
    label: m.nodeKey,
    value,
    timestamp: time,
    sourceTimestamp: time,
    receivedAt,
    dataType: m.dataType,
    statusCode,
    signalMetadata: {
      signalId: `mqtt:${source.id}:${m.nodeKey}`,
      endpointUrl: source.brokerUrl,
      machineId: source.machineId,
      nodeId: identifier,
      namespaceUri: source.brokerUrl,
      identifier,
      mappingRevision: `mqtt:${source.id}`,
      unit: null,
    },
    eventId: `mqtt-${createHash("sha256")
      .update(
        JSON.stringify([source.id, m.nodeKey, time.toISOString(), ...identity]),
      )
      .digest("hex")}`,
    alreadySpooled: true,
  };
}

/** A death leaves the mapped signals unknown instead of holding their last value. */
const deaths = (
  source: { id: number; machineId: number; brokerUrl: string },
  mappings: SparkplugMapping[],
  time: Date,
  receivedAt: Date,
) =>
  mappings.map((m) =>
    measurement(source, m, time, receivedAt, null, "BadCommunicationError", [
      null,
      "death",
    ]),
  );

/**
 * One Sparkplug B message becomes a measurement per mapped metric. Births record aliases and
 * their values; named metrics are always readable, alias-only metrics only after a birth that
 * was followed without a sequence gap. A metric without a source timestamp is refused, a
 * null or wrongly typed value is stored as bad, and identities make redelivery idempotent.
 */
export function parseSparkplugMessage(
  source: { id: number; machineId: number; brokerUrl: string },
  mappings: SparkplugMapping[],
  state: SparkplugState,
  topic: string,
  payload: Buffer,
  receivedAt: Date,
): { measurements: OpcuaNodeData[]; rejected: string | null } {
  const parts = topic.split("/");
  const [namespace, groupId, type, edgeNodeId] = parts;
  const deviceId = parts[4] ?? null;
  const node = state.get(`${groupId}/${edgeNodeId}`);
  if (
    namespace !== "spBv1.0" ||
    parts.length > 5 ||
    !node ||
    !MESSAGE_TYPES.has(type) ||
    (type[0] === "D") !== (deviceId !== null)
  )
    return { measurements: [], rejected: "Unmapped topic" };
  if (payload.length > MAX_SPARKPLUG_PAYLOAD_BYTES)
    return { measurements: [], rejected: "Payload exceeds 256 KiB" };
  let decoded: SparkplugPayload;
  try {
    decoded = decodeSparkplugPayload(payload);
  } catch {
    return {
      measurements: [],
      rejected: "Payload is not a Sparkplug B protobuf",
    };
  }
  const ofNode = mappings.filter(
    (m) => m.groupId === groupId && m.edgeNodeId === edgeNodeId,
  );
  const scoped = ofNode.filter((m) => m.deviceId === deviceId);

  if (type === "NDEATH") {
    const bdSeq = birthSequence(decoded);
    // The broker's will from an earlier session; the node has been born again since.
    if (node.bdSeq !== null && bdSeq !== null && bdSeq !== node.bdSeq)
      return { measurements: [], rejected: null };
    node.seq = null;
    for (const scope of [node.node, ...node.devices.values()])
      lose(scope, "death");
    return {
      measurements: deaths(source, ofNode, receivedAt, receivedAt),
      rejected: null,
    };
  }
  if (type === "NBIRTH") {
    node.bdSeq = birthSequence(decoded);
    node.seq = decoded.seq;
    for (const device of node.devices.values()) lose(device, "birth");
    born(node.node, decoded.metrics);
  } else sequence(node, decoded.seq);

  let scope = node.node;
  if (deviceId !== null) {
    scope = node.devices.get(deviceId) ?? unborn();
    node.devices.set(deviceId, scope);
  }
  if (type === "DBIRTH") born(scope, decoded.metrics);
  if (type === "DDEATH") {
    lose(scope, "death");
    const time =
      decoded.timestamp === null ? receivedAt : new Date(decoded.timestamp);
    return {
      measurements: deaths(source, scoped, time, receivedAt),
      rejected: null,
    };
  }

  const measurements: OpcuaNodeData[] = [];
  let rejected: string | null = null;
  if (!scoped.length) return { measurements, rejected };
  for (const metric of decoded.metrics) {
    const name =
      metric.name ??
      (metric.alias === null ? undefined : scope.aliases?.get(metric.alias)) ??
      null;
    if (name === null) {
      rejected = scope.aliases
        ? `Unknown alias ${metric.alias}`
        : scope.waiting === "sequence gap"
          ? "Alias-only metric after a sequence gap: waiting for the next birth"
          : "Alias-only metric while waiting for a birth certificate";
      continue;
    }
    for (const m of scoped.filter((x) => x.metric === name)) {
      const at = metric.timestamp ?? decoded.timestamp;
      if (at === null) {
        rejected = `No source timestamp for ${m.nodeKey}`;
        continue;
      }
      const datatype =
        metric.datatype ?? scope.types.get(name) ?? SPARKPLUG_TYPE[m.dataType];
      const raw =
        metric.isNull || !metric.value
          ? undefined
          : metricValue(metric.value, datatype);
      const value = typedValue(raw, m.dataType);
      measurements.push(
        measurement(
          source,
          m,
          new Date(at),
          receivedAt,
          value ?? null,
          metric.isNull
            ? "BadNoData"
            : value === undefined
              ? "BadDecodingError"
              : "Good",
          [raw ?? null, metric.isNull ? "null" : "value"],
        ),
      );
    }
  }
  return { measurements, rejected };
}
