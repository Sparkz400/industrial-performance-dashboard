import { useEffect, useState } from 'react';

export interface AssetReading {
  value: number | string | boolean | null;
  rawValue: unknown;
  statusCode: string | null;
  timestamp: string;
  receivedAt: string | null;
}
export interface LiveDataValue extends AssetReading {
  freshness:
    'fresh' | 'stale' | 'bad-quality' | 'disconnected' | 'unknown' | 'clock-skew' | 'unavailable';
}
/**
 * Hide values that cannot honestly represent current machine state.
 * @param reading
 * @param connection
 * @param available
 * @param now
 */
export function assetReading(
  reading: AssetReading,
  connection: string,
  available: boolean,
  now: number,
): LiveDataValue {
  const source = Date.parse(reading.timestamp),
    received = Date.parse(reading.receivedAt ?? '');
  const freshness: LiveDataValue['freshness'] = !available
    ? 'unavailable'
    : connection !== 'connected'
      ? 'disconnected'
      : !Number.isFinite(source) || !Number.isFinite(received)
        ? 'unknown'
        : source > now + 5000 || received > now + 5000
          ? 'clock-skew'
          : now - source > 60000 || now - received > 60000
            ? 'stale'
            : !reading.statusCode?.startsWith('Good')
              ? 'bad-quality'
              : reading.value == null ||
                  !['number', 'boolean', 'string'].includes(typeof reading.value) ||
                  (typeof reading.value === 'number' && !Number.isFinite(reading.value))
                ? 'unknown'
                : 'fresh';
  return { ...reading, freshness, value: freshness === 'fresh' ? reading.value : null };
}
/**
 * Values come from the scoped snapshot; polling also refreshes unchanged readings.
 * @param values
 * @param connection
 * @param available
 */
export function useDigitalTwinLiveData(
  values: Record<string, AssetReading>,
  connection: string,
  available = true,
): Record<string, LiveDataValue> {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Object.fromEntries(
    Object.entries(values).map(([key, reading]) => [
      key,
      assetReading(reading, connection, available, now),
    ]),
  );
}
