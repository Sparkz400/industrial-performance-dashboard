import { createHash } from "node:crypto";
import { resolveNodeId } from "node-opcua";
import type { SignalMetadata } from "@performance-dashboard/shared";
import type { OpcuaNodeConfig } from "./config/opcuaMapping.js";

export function measurementIdentity(
  endpointUrl: string,
  machineId: number | undefined,
  key: string,
  mapping: OpcuaNodeConfig,
  namespaces: string[],
  unit: string | null,
): SignalMetadata {
  const node = resolveNodeId(mapping.nodeId);
  const namespaceUri = namespaces[node.namespace];
  if (!namespaceUri) throw new Error(`Unknown namespace for ${mapping.nodeId}`);
  const identifier = node.toString().replace(/^ns=\d+;/, "");
  const hash = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const signalId = hash([
    endpointUrl,
    machineId ?? null,
    namespaceUri,
    identifier,
  ]);
  return {
    signalId,
    endpointUrl,
    machineId: machineId ?? null,
    nodeId: mapping.nodeId,
    namespaceUri,
    identifier,
    unit,
    mappingRevision: hash([
      signalId,
      key,
      mapping.label,
      mapping.dataType,
      mapping.samplingInterval ?? 500,
      unit,
    ]),
  };
}
