import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_BASE_URL } from '@/config/config';
import type { WidgetComponentProps } from '@/types';
import { registrationsQuery } from './registrations';

/** Message format version sent to widgets with every message. */
const PROTOCOL = 1;
interface Series {
  series: {
    nodeKey: string;
    data: { timestamp: string; value: number | null; statusCode: string | null }[];
  }[];
}

/**
 * Renders a registered third-party widget in a sandbox with an opaque origin. The widget
 * cannot reach this page, its storage or the signed-in session. Only its own frame's
 * handshake is heard, and it receives only the configured machine's chosen signals, read
 * with the viewer's own permissions, when its manifest asks for them.
 * @param root0
 * @param root0.config
 */
export default function CustomWidgetFrame({ config }: WidgetComponentProps) {
  const registrationId = Number(config.registrationId),
    version = String(config.version ?? ''),
    machineId = Number(config.machineId),
    nodeKeys = Array.isArray(config.nodeKeys) ? config.nodeKeys.map(String) : [];
  const registrations = useQuery(registrationsQuery);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false),
    [ignored, setIgnored] = useState(0);
  const registration = registrations.data?.find((r) => r.id === registrationId);
  const allowed = !!registration?.isActive && registration.manifest.version === version;
  const readSeries =
    allowed &&
    registration.manifest.permissions.includes('readSeries') &&
    machineId > 0 &&
    nodeKeys.length > 0;
  const series = useQuery({
    queryKey: ['widget-series', registrationId, machineId, nodeKeys.join(',')],
    enabled: readSeries && ready,
    refetchInterval: 30000,
    queryFn: () => {
      const end = new Date(),
        start = new Date(end.getTime() - 3600000);
      const query = new URLSearchParams({
        machineId: String(machineId),
        nodeKeys: nodeKeys.join(','),
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      return api.get(`${API_BASE_URL}/trending/data?${query}`) as Promise<Series>;
    },
  });
  useEffect(() => {
    if (!allowed) return;
    const listener = (event: MessageEvent) => {
      // A sandboxed frame without allow-same-origin always has the opaque origin "null".
      if (event.source !== frame.current?.contentWindow) return;
      if (event.origin === 'null' && event.data?.type === 'pd:ready') setReady(true);
      else setIgnored((n) => n + 1);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [allowed]);
  useEffect(() => {
    const target = frame.current?.contentWindow;
    // A widget that may read series waits for them rather than seeing an empty answer first.
    if (!ready || !target || (readSeries && !series.data)) return;
    // An opaque origin cannot be named as a target; the payload is limited to the configuration.
    target.postMessage(
      {
        type: 'pd:series',
        version: PROTOCOL,
        machineId: readSeries ? machineId : null,
        series:
          readSeries && series.data
            ? series.data.series.map((s) => ({
                nodeKey: s.nodeKey,
                data: s.data.map(({ timestamp, value, statusCode }) => ({
                  timestamp,
                  value,
                  statusCode,
                })),
              }))
            : [],
      },
      '*',
    );
  }, [ready, readSeries, series.data, machineId]);

  if (registrations.isLoading) return <Typography role="status">Loading widget…</Typography>;
  if (registrations.error) return <Alert severity="error">{String(registrations.error)}</Alert>;
  if (!registration)
    return (
      <Alert severity="warning" role="status">
        This custom widget was removed by an administrator. Remove it from the dashboard.
      </Alert>
    );
  if (!registration.isActive)
    return (
      <Alert severity="warning" role="status">
        This custom widget is disabled by an administrator.
      </Alert>
    );
  if (registration.manifest.version !== version)
    return (
      <Alert severity="warning" role="status">
        Widget changed from version {version || 'unknown'} to {registration.manifest.version}. Edit
        this widget to review and accept the new version.
      </Alert>
    );
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box
        component="iframe"
        ref={frame}
        title={registration.manifest.name}
        src={registration.manifest.entryUrl}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        sx={{ border: 0, flex: 1, minHeight: 0, width: '100%' }}
      />
      <Typography variant="caption" color="text.secondary">
        Sandboxed third-party widget {registration.manifest.name} v{version};{' '}
        {readSeries ? `receives ${nodeKeys.join(', ')} only` : 'receives no data'}.
        {ignored ? ` Ignored ${ignored} message(s) it sent.` : ''}
      </Typography>
    </Box>
  );
}
