import React, { useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useLanguage, useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { operationRequest } from './api';

interface PlcAlarms {
  enabled: boolean;
  status: {
    state: string;
    received?: number;
    refreshCalls?: number;
    lastError?: string | null;
  } | null;
  events: {
    id: number;
    eventTime: string;
    appSeverity: string;
    severity: number;
    sourceName: string | null;
    conditionName: string | null;
    conditionId: string | null;
    message: string | null;
    active: boolean | null;
    acked: boolean | null;
    refresh: boolean;
  }[];
  truncated: boolean;
}
const state = (value: boolean | null, on: string, off: string) =>
  value == null ? '–' : value ? on : off;

/**
 * Alarms and conditions observed on the machine's OPC UA server, read-only.
 * @param root0
 * @param root0.machineId
 */
export default function PlcAlarmsPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    language = useLanguage((s) => s.language),
    admin = useAuthStore((s) => s.user?.role === 'admin');
  const [error, setError] = useState('');
  const alarms = useQuery({
    queryKey: ['plc-alarms', machineId],
    queryFn: () => operationRequest<PlcAlarms>(`/plc-alarms/machines/${machineId}`),
    refetchInterval: 5000,
  });
  const data = alarms.data;
  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="h5">{t('PLC alarms', 'SPS-Alarme')}</Typography>
      <Alert severity="info">
        {t(
          "Alarms and conditions read from the machine's OPC UA server. The application only asks the server to resend current conditions (ConditionRefresh) and never acknowledges, confirms or comments. Rows marked as resent are current state replayed after a connect, not new transitions.",
          'Alarme und Bedingungen vom OPC-UA-Server der Maschine. Die Anwendung fordert nur die aktuellen Bedingungen erneut an (ConditionRefresh) und quittiert, bestätigt oder kommentiert nie. Als erneut gesendet markierte Zeilen sind nach einem Verbindungsaufbau wiedergegebener Zustand, keine neuen Übergänge.',
        )}
      </Alert>
      {(error || alarms.error) && <Alert severity="error">{error || String(alarms.error)}</Alert>}
      {data && (
        <Typography role="status">
          {data.enabled ? t('Observed', 'Beobachtet') : t('Not observed', 'Nicht beobachtet')}
          {data.status?.state ? ` · ${data.status.state}` : ''}
          {data.status?.lastError ? ` · ${data.status.lastError}` : ''}
        </Typography>
      )}
      {admin && data && (
        <Button
          sx={{ alignSelf: 'flex-start' }}
          variant="outlined"
          onClick={() => {
            setError('');
            void operationRequest(`/plc-alarms/machines/${machineId}/subscription`, 'PUT', {
              enabled: !data.enabled,
            })
              .then(() => alarms.refetch())
              .catch((e) => setError(String(e)));
          }}
        >
          {data.enabled
            ? t('Stop observing PLC alarms', 'SPS-Alarme nicht mehr beobachten')
            : t('Observe PLC alarms (read-only)', 'SPS-Alarme beobachten (nur lesen)')}
        </Button>
      )}
      {data?.truncated && <Alert severity="warning">{t('Latest 200 events shown.')}</Alert>}
      {!!data?.events.length && (
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            component="table"
            aria-label={t('PLC alarm events', 'SPS-Alarmereignisse')}
            sx={{
              borderCollapse: 'collapse',
              width: '100%',
              '& td, & th': { pr: 2, py: 0.5, textAlign: 'left', verticalAlign: 'top' },
            }}
          >
            <thead>
              <tr>
                <th>{t('Time', 'Zeit')}</th>
                <th>{t('Severity', 'Schwere')}</th>
                <th>{t('Source', 'Quelle')}</th>
                <th>{t('Condition', 'Bedingung')}</th>
                <th>{t('Message', 'Meldung')}</th>
                <th>{t('State', 'Zustand')}</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.eventTime).toLocaleString(language)}</td>
                  <td>
                    {e.appSeverity} ({e.severity})
                  </td>
                  <td>{e.sourceName ?? '–'}</td>
                  <td>{e.conditionName ?? t('information only', 'nur Information')}</td>
                  <td>{e.message ?? '–'}</td>
                  <td>
                    {state(e.active, t('active', 'aktiv'), t('inactive', 'inaktiv'))} ·{' '}
                    {state(
                      e.acked,
                      t('acknowledged', 'quittiert'),
                      t('unacknowledged', 'unquittiert'),
                    )}
                    {e.refresh ? ` · ${t('resent', 'erneut gesendet')}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      )}
    </Stack>
  );
}
