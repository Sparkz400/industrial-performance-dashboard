import * as opcua from "node-opcua";
import { withMachineSession } from "./commissioningService.js";

/** Companion specifications recognised by their namespace URI. */
export const COMPANION_MODELS: Record<string, string> = {
  "http://opcfoundation.org/UA/Machinery/": "OPC 40001-1 Machinery",
  "http://opcfoundation.org/UA/DI/": "OPC 10000-100 Devices",
  "http://opcfoundation.org/UA/PackML/": "OPC 30050 PackML",
  "http://opcfoundation.org/UA/MachineTool/": "OPC 40501-1 Machine Tools",
  "http://opcfoundation.org/UA/Weihenstephan/": "OPC 40050 Weihenstephan",
};
const MACHINERY = "http://opcfoundation.org/UA/Machinery/";
const ITEM_STATE_TYPE = 1002; // MachineryItemState_StateMachineType in Machinery 1.04
/** StateNumber of each Machinery item state; NotAvailable (0) cannot tell "off" from an emergency stop. */
export const ITEM_STATE_VALUES = {
  running: [3],
  idle: [2],
  fault: [],
  planned: [1],
};
const SUPPORTED = [
  "Boolean",
  "Byte",
  "SByte",
  "Int16",
  "UInt16",
  "Int32",
  "UInt32",
  "Float",
  "Double",
];
export type Role = "state" | "total" | "good" | "reject";
const KEYS: Record<Role, string> = {
  state: "MachineState",
  total: "TotalCount",
  good: "GoodCount",
  reject: "RejectCount",
};

/** Name rule for variables no model declares; a guess a person must confirm. */
export function nameRole(name: string): Role | null {
  if (/reject|scrap|nok|defect|bad/i.test(name)) return "reject";
  if (/good|^ok|yield/i.test(name)) return "good";
  if (/total|produced|parts|count/i.test(name)) return "total";
  if (/state|status|mode/i.test(name)) return "state";
  return null;
}

export interface Suggestion {
  role: Role;
  nodeKey: string;
  namespaceUri: string;
  identifier: string;
  dataType: string;
  browsePath: string;
  confidence: "high" | "low";
  rule: string;
  model: string | null;
  states?: typeof ITEM_STATE_VALUES;
}

const identifier = (nodeId: opcua.NodeId) =>
  nodeId.toString().replace(/^ns=\d+;/, "");

/**
 * Read-only browse of the address space (at most 2,000 nodes, six levels) for mapping
 * proposals. Declared Machinery item states are high confidence; name matches are low.
 * Nothing is mapped until the profile is previewed, reviewed and saved.
 */
export async function suggestMappings(machineId: number) {
  return withMachineSession(machineId, async (session) => {
    const namespaces = await session.readNamespaceArray();
    const models = namespaces
      .filter((uri) => COMPANION_MODELS[uri])
      .map((uri) => ({ uri, name: COMPANION_MODELS[uri] }));
    const machinery = namespaces.indexOf(MACHINERY);
    const browse = async (nodeId: opcua.NodeIdLike) =>
      (
        await session.browse({
          nodeId,
          referenceTypeId: opcua.ReferenceTypeIds.HierarchicalReferences,
          includeSubtypes: true,
          browseDirection: opcua.BrowseDirection.Forward,
          nodeClassMask:
            opcua.NodeClassMask.Object | opcua.NodeClassMask.Variable,
          resultMask: 63,
        })
      ).references ?? [];
    const named: { nodeId: opcua.NodeId; path: string; role: Role }[] = [];
    const stateMachines: { nodeId: opcua.NodeId; path: string }[] = [];
    const queue = [
      {
        nodeId: opcua.resolveNodeId("ObjectsFolder"),
        path: "Objects",
        depth: 0,
      },
    ];
    const seen = new Set<string>();
    let truncated = false;
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.size >= 2000) {
        truncated = true;
        break;
      }
      for (const ref of await browse(next.nodeId)) {
        const key = ref.nodeId.toString();
        // The Server object (ns=0;i=2253) describes the server itself, not the machine.
        if (
          seen.has(key) ||
          (ref.nodeId.namespace === 0 &&
            ref.nodeId.value === opcua.ObjectIds.Server)
        )
          continue;
        seen.add(key);
        const name = ref.browseName.name ?? "",
          path = `${next.path}/${name}`;
        const type = ref.typeDefinition;
        if (
          machinery >= 0 &&
          type?.namespace === machinery &&
          type.value === ITEM_STATE_TYPE
        ) {
          stateMachines.push({ nodeId: ref.nodeId, path });
          continue;
        }
        if (ref.nodeClass === opcua.NodeClass.Variable) {
          const role = nameRole(name);
          if (role) named.push({ nodeId: ref.nodeId, path, role });
        }
        if (next.depth < 6)
          queue.push({ nodeId: ref.nodeId, path, depth: next.depth + 1 });
      }
    }
    const notes: string[] = [];
    const typed: { nodeId: opcua.NodeId; path: string }[] = [];
    for (const machine of stateMachines) {
      const current = (await browse(machine.nodeId)).find(
        (r) => r.browseName.name === "CurrentState",
      );
      const number =
        current &&
        (await browse(current.nodeId)).find(
          (r) => r.browseName.name === "Number",
        );
      if (number)
        typed.push({
          nodeId: number.nodeId,
          path: `${machine.path}/CurrentState/Number`,
        });
      else
        notes.push(
          `${machine.path} declares a Machinery item state without CurrentState/Number; map a numeric state signal instead.`,
        );
    }
    const candidates = [...typed, ...named];
    const types = candidates.length
      ? await session.read(
          candidates.map((c) => ({
            nodeId: c.nodeId,
            attributeId: opcua.AttributeIds.DataType,
          })),
        )
      : [];
    const dataType = (i: number) => {
      const value = types[i].value.value as opcua.NodeId | null;
      return value && value.namespace === 0
        ? (opcua.DataType[value.value as number] ?? "")
        : "";
    };
    const suggestions: Suggestion[] = [];
    candidates.forEach((c, i) => {
      const role: Role =
        i < typed.length ? "state" : named[i - typed.length].role;
      const type = dataType(i);
      if (!SUPPORTED.includes(type)) return;
      const declared = i < typed.length;
      suggestions.push({
        role,
        nodeKey: KEYS[role],
        namespaceUri: namespaces[c.nodeId.namespace],
        identifier: identifier(c.nodeId),
        dataType: type,
        browsePath: c.path,
        confidence: declared ? "high" : "low",
        rule: declared
          ? "Declared Machinery item state (MachineryItemState_StateMachineType)"
          : "Browse name only",
        model: declared ? COMPANION_MODELS[MACHINERY] : null,
        ...(declared ? { states: ITEM_STATE_VALUES } : {}),
      });
    });
    const order = { high: 0, low: 1 };
    return {
      checkedAt: new Date().toISOString(),
      models,
      standardModel: models.some((m) => m.uri === MACHINERY),
      suggestions: (["state", "total", "good", "reject"] as Role[]).flatMap(
        (role) =>
          suggestions
            .filter((s) => s.role === role)
            .sort(
              (a, b) =>
                order[a.confidence] - order[b.confidence] ||
                a.browsePath.localeCompare(b.browsePath),
            )
            .slice(0, 5),
      ),
      notes,
      truncated,
      limitations: [
        "Proposals only: nothing is mapped until the profile is previewed, reviewed and saved.",
        "Name matches are guesses from browse names, not declared meaning.",
        "Machinery NotAvailable (0) stays unmapped: switched off and emergency stop are not distinguishable.",
        "PackML and Weihenstephan counters are structured or optional; those models are detected but not mapped.",
        "Read-only browse of at most 2,000 nodes; no machine writes.",
      ],
    };
  });
}
