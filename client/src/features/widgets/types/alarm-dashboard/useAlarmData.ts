import { useState, useEffect } from 'react';

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
  CLEARED: 'cleared',
} as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[keyof typeof SEVERITY_LEVELS];
export type AlarmStatus = (typeof ALARM_STATUS)[keyof typeof ALARM_STATUS];

export interface Alarm {
  id: string;
  time: string;
  message: string;
  severity: SeverityLevel;
  status: AlarmStatus;
  source: string;
  acknowledgedTime?: string;
  clearedTime?: string;
}

interface UseAlarmDataReturn {
  data: Alarm[];
  loading: boolean;
  error: string | null;
  acknowledgeAlarm: (id: string) => void;
  clearAlarm: (id: string) => void;
}

// Simplified hook with minimal dependencies
/**
 *
 */
export function useAlarmData(): UseAlarmDataReturn {
  const [data, setData] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Generate mock data only once on mount
  useEffect(() => {
    setLoading(true);

    try {
      // Generate mock data
      const mockData = generateMockAlarms();
      setData(mockData);
      setError(null);
    } catch (err) {
      setError('Error generating alarm data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // No dependency on any state for this function
  /**
   *
   * @param id
   */
  function acknowledgeAlarm(id: string): void {
    setData((prev) =>
      prev.map((alarm) => {
        if (alarm.id === id && alarm.status === ALARM_STATUS.ACTIVE) {
          return {
            ...alarm,
            status: ALARM_STATUS.ACKNOWLEDGED,
            acknowledgedTime: new Date().toISOString(),
          };
        }
        return alarm;
      }),
    );
  }

  // No dependency on any state for this function
  /**
   *
   * @param id
   */
  function clearAlarm(id: string): void {
    setData((prev) =>
      prev.map((alarm) => {
        if (alarm.id === id && alarm.status !== ALARM_STATUS.CLEARED) {
          return {
            ...alarm,
            status: ALARM_STATUS.CLEARED,
            clearedTime: new Date().toISOString(),
          };
        }
        return alarm;
      }),
    );
  }

  return {
    data,
    loading,
    error,
    acknowledgeAlarm,
    clearAlarm,
  };
}

// Standalone function with no dependencies
/**
 *
 */
function generateMockAlarms(): Alarm[] {
  const alarmTypes: string[] = [
    'High Temperature',
    'Low Pressure',
    'Motor Overload',
    'Communication Error',
    'Sensor Fault',
    'Valve Failure',
  ];

  const sources: string[] = ['System', 'PLC1', 'PLC2', 'Conveyor', 'Robot', 'Temperature Sensor'];

  const severities: SeverityLevel[] = [
    SEVERITY_LEVELS.CRITICAL,
    SEVERITY_LEVELS.HIGH,
    SEVERITY_LEVELS.MEDIUM,
    SEVERITY_LEVELS.LOW,
    SEVERITY_LEVELS.INFO,
  ];

  const statuses: AlarmStatus[] = [
    ALARM_STATUS.ACTIVE,
    ALARM_STATUS.ACKNOWLEDGED,
    ALARM_STATUS.CLEARED,
  ];

  const mockAlarms: Alarm[] = [];
  const now = new Date();

  for (let i = 0; i < 50; i++) {
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const alarmType = alarmTypes[Math.floor(Math.random() * alarmTypes.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];

    const time = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    mockAlarms.push({
      id: `alarm-${i}`,
      time: time.toISOString(),
      message: `${alarmType} detected on ${source}`,
      severity,
      status,
      source,
    });
  }

  return mockAlarms;
}

export default useAlarmData;
