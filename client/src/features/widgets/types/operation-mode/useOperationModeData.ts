import { useNodeData, type NodeDataPoint } from '../../hooks/useNodeData';
export interface OperationModeDataPoint extends NodeDataPoint {
  mode: number | null;
}
/**
 * Adapt measured mode codes without imposing an uncommissioned state mapping.
 * @param root0 Query options.
 * @param root0.maxPoints Maximum observations.
 * @param root0.machineId Selected machine.
 */
export function useOperationModeData({
  maxPoints = 120,
  machineId,
}: { maxPoints?: number; machineId?: number } = {}) {
  const result = useNodeData({ nodeKey: 'OperationMode', machineId, maxPoints });
  return {
    ...result,
    data: result.data.map((point) => ({
      ...point,
      time: new Date(point.timestamp).toLocaleString(),
      timestamp: point.timestamp,
      mode: point.value,
    })),
    error:
      result.error ??
      (result.freshness !== 'fresh'
        ? `Current reading: ${result.freshness}. Historical evidence remains visible.`
        : null),
  };
}
