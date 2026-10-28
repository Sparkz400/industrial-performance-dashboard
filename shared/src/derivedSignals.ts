export const signalUnits = [
  "1",
  "count",
  "s",
  "kWh",
  "Wh",
  "kW",
  "W",
  "m3",
  "L",
  "bar",
  "C",
] as const;
export type SignalUnit = (typeof signalUnits)[number];
export type SignalExpression =
  | {
      kind: "input";
      key: string;
      namespaceUri: string;
      identifier: string;
      unit: SignalUnit;
    }
  | { kind: "constant"; value: number; unit: SignalUnit }
  | {
      kind: "add" | "subtract" | "multiply" | "divide";
      left: SignalExpression;
      right: SignalExpression;
    };
export interface DerivedSpecification {
  expression: SignalExpression;
  maxAgeSeconds: number;
}
export interface DerivedSignalDefinition {
  id: number;
  machineId: number;
  name: string;
  version: number;
  expression: DerivedSpecification;
  createdBy: number;
  createdAt: string;
}
export interface DerivedObservation {
  measurementId: number;
  eventId: string | null;
  correctionRevision: number;
  key: string;
  timestamp: string;
  receivedAt: string | null;
  sourceTimestamp: string | null;
  value: number | null;
  rawValue: unknown;
  statusCode: string | null;
  reportedStatusCode?: string | null;
  sourceClockState?: string;
  namespaceUri: string | null;
  identifier: string | null;
}
export interface DerivedResult {
  value: number | null;
  unit: string;
  quality: "good" | "unknown";
  reasons: string[];
  inputs: DerivedObservation[];
}
export interface DerivedEvaluation {
  definition: DerivedSignalDefinition;
  definitionDigest: string;
  start: string;
  end: string;
  evaluatedAt: string;
  points: ({ timestamp: string } & DerivedResult)[];
  current: DerivedResult;
  sampleCount: number;
  truncated: boolean;
  unitDeclaration: string;
}
