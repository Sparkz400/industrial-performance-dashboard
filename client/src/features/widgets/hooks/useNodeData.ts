import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '@/config/config';
import { widgetReadings, type NodeDataPoint } from './widgetReadings';
export type { NodeDataPoint } from './widgetReadings';
interface UseNodeDataOptions {
  nodeKey: string;
  machineId?: number;
  maxPoints?: number;
  enabled?: boolean;
}
/**
 * Poll bounded source history for exactly one machine.
 * @param root0 Query options.
 * @param root0.nodeKey Source key.
 * @param root0.machineId Selected machine.
 * @param root0.maxPoints Maximum returned samples.
 * @param root0.enabled Whether polling is enabled.
 */
export function useNodeData({
  nodeKey,
  machineId,
  maxPoints = 120,
  enabled = true,
}: UseNodeDataOptions) {
  const [data, setData] = useState<NodeDataPoint[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [now, setNow] = useState(Date.now);
  const scoped = enabled && Number.isInteger(machineId) && Number(machineId) > 0;
  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!scoped) return;
      const params = new URLSearchParams({
        nodeKey,
        machineId: String(machineId),
        limit: String(Math.min(5000, maxPoints)),
        latest: 'true',
      });
      try {
        const response = await fetch(`${API_ENDPOINTS.nodeData}?${params}`, {
          credentials: 'include',
          signal,
        });
        if (!response.ok) throw new Error(`Data unavailable (${response.status})`);
        const rows = (await response.json()) as NodeDataPoint[];
        if (!signal?.aborted) {
          setData(widgetReadings(rows));
          setError(null);
        }
      } catch (failure) {
        if (!signal?.aborted) {
          setData([]);
          setError(String(failure));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [scoped, nodeKey, machineId, maxPoints],
  );
  useEffect(() => {
    setData([]);
    setError(scoped ? null : 'Select one machine in widget settings');
    setLoading(scoped);
    const controller = new AbortController();
    void fetchData(controller.signal);
    const timer = setInterval(() => {
      setNow(Date.now());
      void fetchData(controller.signal);
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [fetchData, scoped]);
  const last = data.at(-1),
    timestamp = last ? Date.parse(last.timestamp) : NaN;
  const freshness = !last
    ? 'unknown'
    : timestamp > now + 5000
      ? 'clock-skew'
      : now - timestamp > 60000
        ? 'stale'
        : last.value == null
          ? 'bad-quality'
          : 'fresh';
  return {
    data,
    loading,
    error,
    lastUpdated: Number.isFinite(timestamp) ? new Date(timestamp) : null,
    freshness,
    refresh: () => fetchData(),
  };
}
