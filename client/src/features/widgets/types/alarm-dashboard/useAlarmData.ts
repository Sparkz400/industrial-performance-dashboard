import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '@/config/config';
import { useStatusStore } from '@/stores/useStatusStore';
import type { AlarmEvent } from '@/types';

// Constants
export const SEVERITY_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
} as const;

export const ALARM_STATUS = {
  ACTIVE: 'active',
  ACKNOWLEDGED: 'acknowledged',
  CLEARED: 'resolved',
} as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[keyof typeof SEVERITY_LEVELS];
export type AlarmStatus = (typeof ALARM_STATUS)[keyof typeof ALARM_STATUS];

export interface Alarm {
  id: number;
  ruleId: number | null;
  ruleName: string | null;
  machineId: number | null;
  nodeKey: string | null;
  severity: string | null;
  status: string | null;
  message: string | null;
  triggerValue: number | null;
  threshold: number | null;
  acknowledgedBy: number | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
}

interface UseAlarmDataReturn {
  data: Alarm[];
  loading: boolean;
  error: string | null;
  acknowledgeAlarm: (id: number) => void;
  clearAlarm: (id: number) => void;
}

/**
 *
 */
export function useAlarmData(): UseAlarmDataReturn {
  const [data, setData] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const socket = useStatusStore((s) => s.socket);
  const socketConnected = useStatusStore((s) => s.socketConnected);

  const fetchAlarms = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_ENDPOINTS.alarms.base}?limit=200`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const alarms: Alarm[] = await response.json();
      setData(alarms);
      setError(null);
    } catch (err) {
      console.error('Error fetching alarms:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    void fetchAlarms();
  }, [fetchAlarms]);

  // Socket.IO real-time updates
  useEffect(() => {
    if (!socket || !socketConnected) return;

    const handleAlarmTriggered = (alarm: AlarmEvent) => {
      setData((prev) => [mapAlarmEventToAlarm(alarm), ...prev].slice(0, 200));
    };

    const handleAlarmAcknowledged = (alarm: AlarmEvent) => {
      setData((prev) =>
        prev.map((a) =>
          a.id === alarm.id
            ? { ...a, status: 'acknowledged', acknowledgedAt: alarm.acknowledgedAt ?? null }
            : a,
        ),
      );
    };

    const handleAlarmCleared = (alarm: AlarmEvent) => {
      setData((prev) =>
        prev.map((a) =>
          a.id === alarm.id ? { ...a, status: 'resolved', resolvedAt: alarm.clearedAt ?? null } : a,
        ),
      );
    };

    socket.on('alarmTriggered', handleAlarmTriggered);
    socket.on('alarmAcknowledged', handleAlarmAcknowledged);
    socket.on('alarmCleared', handleAlarmCleared);

    return () => {
      socket.off('alarmTriggered', handleAlarmTriggered);
      socket.off('alarmAcknowledged', handleAlarmAcknowledged);
      socket.off('alarmCleared', handleAlarmCleared);
    };
  }, [socket, socketConnected]);

  const acknowledgeAlarm = useCallback(async (id: number) => {
    try {
      const response = await fetch(API_ENDPOINTS.alarms.acknowledge(id), {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const { alarm } = await response.json();
      setData((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...alarm, status: alarm.status } : a)),
      );
    } catch (err) {
      console.error('Error acknowledging alarm:', err);
    }
  }, []);

  const clearAlarm = useCallback(async (id: number) => {
    try {
      const response = await fetch(API_ENDPOINTS.alarms.clear(id), {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const { alarm } = await response.json();
      setData((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...alarm, status: alarm.status } : a)),
      );
    } catch (err) {
      console.error('Error clearing alarm:', err);
    }
  }, []);

  return { data, loading, error, acknowledgeAlarm, clearAlarm };
}

/**
 *
 * @param event
 */
function mapAlarmEventToAlarm(event: AlarmEvent): Alarm {
  return {
    id: event.id,
    ruleId: event.ruleId,
    ruleName: event.source,
    machineId: event.machineId,
    nodeKey: event.nodeKey,
    severity: event.severity,
    status: event.status,
    message: event.message,
    triggerValue: event.value,
    threshold: event.threshold,
    acknowledgedBy: event.acknowledgedBy ?? null,
    acknowledgedAt: event.acknowledgedAt ?? null,
    resolvedAt: event.clearedAt ?? null,
    metadata: null,
    createdAt: event.triggeredAt,
  };
}

export default useAlarmData;
