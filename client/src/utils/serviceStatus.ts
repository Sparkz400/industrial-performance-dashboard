import type { ServiceStatus, SystemStatus } from '@/types';

/**
 *
 * @param status
 */
export function statusColor(
  status: string | undefined,
): 'success' | 'warning' | 'error' | 'default' {
  switch (status?.toUpperCase()) {
    case 'CONNECTED':
    case 'OK':
    case 'HEALTHY':
    case 'ONLINE':
      return 'success';
    case 'WARNING':
    case 'DEGRADED':
      return 'warning';
    case 'ERROR':
    case 'DISCONNECTED':
    case 'OFFLINE':
      return 'error';
    default:
      return 'default';
  }
}

// A browser link cannot fill an unknown service observation.
/**
 *
 * @param status
 */
export function systemObservation(status: SystemStatus): ServiceStatus {
  const services = [status.database, status.opcua];
  if (
    services.some((service) => statusColor(service.status) === 'error') ||
    statusColor(status.overall.status) === 'error'
  )
    return { ...status.overall, status: 'ERROR', statusText: 'Error', statusColor: 'error' };
  if (
    services.some((service) => statusColor(service.status) === 'default') ||
    statusColor(status.overall.status) === 'default'
  )
    return { ...status.overall, status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default' };
  if (
    services.every((service) => statusColor(service.status) === 'success') &&
    statusColor(status.overall.status) === 'success'
  )
    return {
      ...status.overall,
      status: 'CONNECTED',
      statusText: 'Connected',
      statusColor: 'success',
    };
  return { ...status.overall, status: 'WARNING', statusText: 'Degraded', statusColor: 'warning' };
}
