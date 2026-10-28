import type {
  DerivedObservation,
  DerivedResult,
  DerivedSpecification,
  SignalExpression,
  SignalUnit,
} from "@performance-dashboard/shared";
import { ValidationError } from "../utils/errors.js";

const units: Record<SignalUnit, { dimension: string; scale: number }> = {
  "1": { dimension: "", scale: 1 },
  count: { dimension: "count", scale: 1 },
  s: { dimension: "s", scale: 1 },
  kWh: { dimension: "kWh", scale: 1 },
  Wh: { dimension: "kWh", scale: 0.001 },
  kW: { dimension: "kW", scale: 1 },
  W: { dimension: "kW", scale: 0.001 },
  m3: { dimension: "m3", scale: 1 },
  L: { dimension: "m3", scale: 0.001 },
  bar: { dimension: "bar", scale: 1 },
  C: { dimension: "C", scale: 1 },
};
type Dimensions = Record<string, number>;
function dimensions(unit: SignalUnit): Dimensions {
  const name = units[unit].dimension;
  return name ? { [name]: 1 } : {};
}
function unitName(dim: Dimensions) {
  return (
    Object.entries(dim)
      .filter(([, n]) => n !== 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, n]) => (n === 1 ? key : `${key}^${n}`))
      .join("·") || "1"
  );
}
function combine(left: Dimensions, right: Dimensions, sign: number) {
  const result = { ...left };
  for (const [key, power] of Object.entries(right))
    result[key] = (result[key] ?? 0) + sign * power;
  return result;
}
export function validateDerivedSpecification(
  value: unknown,
): DerivedSpecification {
  const fail = () => {
    throw new ValidationError(
      "Choose a bounded numeric expression with compatible declared units",
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const spec = value as Record<string, unknown>;
  if (
    Object.keys(spec).sort().join(",") !== "expression,maxAgeSeconds" ||
    !Number.isInteger(spec.maxAgeSeconds) ||
    Number(spec.maxAgeSeconds) < 1 ||
    Number(spec.maxAgeSeconds) > 3600
  )
    return fail();
  let count = 0;
  const declaredInputs = new Map<string, string>();
  const inspect = (node: unknown, depth: number): Dimensions => {
    if (
      ++count > 32 ||
      depth > 8 ||
      !node ||
      typeof node !== "object" ||
      Array.isArray(node)
    )
      return fail();
    const n = node as Record<string, unknown>;
    const fields = Object.keys(n).sort().join(",");
    if (n.kind === "input" || n.kind === "constant") {
      if (typeof n.unit !== "string" || !Object.hasOwn(units, n.unit))
        return fail();
      if (n.kind === "constant") {
        if (
          fields !== "kind,unit,value" ||
          typeof n.value !== "number" ||
          !Number.isFinite(n.value) ||
          Math.abs(n.value) > 1e15
        )
          return fail();
      } else {
        if (
          fields !== "identifier,key,kind,namespaceUri,unit" ||
          [n.key, n.namespaceUri, n.identifier].some(
            (s) => typeof s !== "string" || !s.trim() || s.length > 512,
          )
        )
          return fail();
        const identity = JSON.stringify([n.namespaceUri, n.identifier, n.unit]);
        if (
          declaredInputs.has(String(n.key)) &&
          declaredInputs.get(String(n.key)) !== identity
        )
          return fail();
        declaredInputs.set(String(n.key), identity);
        if (declaredInputs.size > 8) return fail();
      }
      return dimensions(n.unit as SignalUnit);
    }
    if (
      fields !== "kind,left,right" ||
      !["add", "subtract", "multiply", "divide"].includes(String(n.kind))
    )
      return fail();
    const left = inspect(n.left, depth + 1),
      right = inspect(n.right, depth + 1);
    if (["add", "subtract"].includes(String(n.kind))) {
      if (unitName(left) !== unitName(right)) return fail();
      return left;
    }
    return combine(left, right, n.kind === "divide" ? -1 : 1);
  };
  inspect(spec.expression, 1);
  return value as DerivedSpecification;
}
export function expressionInputs(
  expression: SignalExpression,
): Extract<SignalExpression, { kind: "input" }>[] {
  if (expression.kind === "input") return [expression];
  if (expression.kind === "constant") return [];
  return [
    ...expressionInputs(expression.left),
    ...expressionInputs(expression.right),
  ];
}
export function evaluateDerived(
  spec: DerivedSpecification,
  observations: Map<string, DerivedObservation>,
  at: Date,
): DerivedResult {
  const reasons = new Set<string>(),
    evidence = new Map<string, DerivedObservation>();
  const evaluate = (
    node: SignalExpression,
  ): { value: number | null; dimensions: Dimensions } => {
    if (node.kind === "constant")
      return {
        value: node.value * units[node.unit].scale,
        dimensions: dimensions(node.unit),
      };
    if (node.kind === "input") {
      const observation = observations.get(node.key);
      if (observation) evidence.set(node.key, observation);
      let reason: string | null = null;
      if (!observation) reason = `${node.key}: missing`;
      else if (
        observation.namespaceUri !== node.namespaceUri ||
        observation.identifier !== node.identifier
      )
        reason = `${node.key}: identity changed or unknown`;
      else if (!observation.statusCode?.startsWith("Good"))
        reason = `${node.key}: bad or unknown quality`;
      else if (observation.value == null || !Number.isFinite(observation.value))
        reason = `${node.key}: nonnumeric`;
      else if (
        !Number.isFinite(Date.parse(observation.timestamp)) ||
        Date.parse(observation.timestamp) > at.getTime()
      )
        reason = `${node.key}: invalid or future time`;
      else if (
        observation.sourceTimestamp &&
        (!Number.isFinite(Date.parse(observation.sourceTimestamp)) ||
          Date.parse(observation.sourceTimestamp) > at.getTime() + 5000)
      )
        reason = `${node.key}: source clock is invalid or future`;
      else if (
        at.getTime() - Date.parse(observation.timestamp) >
        spec.maxAgeSeconds * 1000
      )
        reason = `${node.key}: stale`;
      if (reason) reasons.add(reason);
      return {
        value: reason ? null : observation!.value! * units[node.unit].scale,
        dimensions: dimensions(node.unit),
      };
    }
    const left = evaluate(node.left),
      right = evaluate(node.right);
    const dim = ["add", "subtract"].includes(node.kind)
      ? left.dimensions
      : combine(
          left.dimensions,
          right.dimensions,
          node.kind === "divide" ? -1 : 1,
        );
    let value: number | null = null;
    if (left.value != null && right.value != null) {
      if (node.kind === "divide" && right.value === 0)
        reasons.add("Division by zero");
      else
        value =
          node.kind === "add"
            ? left.value + right.value
            : node.kind === "subtract"
              ? left.value - right.value
              : node.kind === "multiply"
                ? left.value * right.value
                : left.value / right.value;
      if (value != null && !Number.isFinite(value)) {
        value = null;
        reasons.add("Numeric overflow");
      }
    }
    return { value, dimensions: dim };
  };
  const result = evaluate(spec.expression);
  return {
    value: result.value,
    unit: unitName(result.dimensions),
    quality: result.value == null ? "unknown" : "good",
    reasons: [...reasons],
    inputs: [...evidence.values()],
  };
}
