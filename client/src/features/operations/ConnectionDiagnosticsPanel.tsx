import React from 'react';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ConnectionDiagnostics } from '@performance-dashboard/shared';
import { formatNumber, useT } from '@/i18n';
import { operationRequest } from './api';
/**
 * Inspect current collector evidence without changing machine settings.
 * @param root0
 * @param root0.machineId
 */
export default function ConnectionDiagnosticsPanel({ machineId }: { machineId: number }) {
  const t = useT();
  const query = useQuery({
    queryKey: ['connection-diagnostics', machineId],
    queryFn: () => operationRequest<ConnectionDiagnostics>(`/diagnostics/machines/${machineId}`),
  });
  const number = (n: number | null | undefined) => formatNumber(n, 1);
  const date = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString() : t('Unknown', 'Unbekannt');
  const state = (value: string) =>
    new Map(
      Object.entries({
        connecting: t('Connecting', 'Verbindungsaufbau'),
        connected: t('Connected', 'Verbunden'),
        reconnecting: t('Reconnecting', 'Wiederverbindung'),
        disconnected: t('Disconnected', 'Getrennt'),
        failed: t('Failed', 'Fehlgeschlagen'),
        pending: t('Pending', 'Ausstehend'),
        monitoring: t('Monitoring', 'Überwachung aktiv'),
        rejected: t('Rejected', 'Abgewiesen'),
        terminated: t('Terminated', 'Beendet'),
        fresh: t('Fresh', 'Aktuell'),
        stale: t('Stale', 'Veraltet'),
        unknown: t('Unknown', 'Unbekannt'),
      }),
    ).get(value) ?? value;
  const data = query.data,
    runtime = data?.runtime;
  return (
    <Stack
      spacing={2}
      sx={{ minWidth: 0, overflowWrap: 'anywhere', '& .MuiButton-root': { minHeight: 44 } }}
    >
      <Typography variant="h5">{t('Connection diagnostics', 'Verbindungsdiagnose')}</Typography>
      <Alert severity="info">
        {t(
          'Counters describe this collector process and connection attempt. A healthy connection does not prove complete production data. Missing measurements and total lost samples remain unknown.',
          'Zähler beschreiben diesen Erfassungsprozess und Verbindungsversuch. Eine funktionierende Verbindung belegt keine vollständigen Produktionsdaten. Fehlende Messwerte und die Gesamtzahl verlorener Werte bleiben unbekannt.',
        )}
      </Alert>
      <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
        {t('Refresh diagnostics', 'Diagnose aktualisieren')}
      </Button>
      {query.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
      {query.error && <Alert severity="error">{String(query.error)}</Alert>}
      {data && (
        <>
          <Typography>
            {t('Captured', 'Erfasst')}: {date(data.capturedAt)}
          </Typography>
          <Paper sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography variant="h6">
                {t('Connection and subscription', 'Verbindung und Abonnement')}
              </Typography>
              <Typography>
                {t('Connection state', 'Verbindungsstatus')}:{' '}
                {runtime ? state(runtime.state) : t('Unknown', 'Unbekannt')}
              </Typography>
              <Typography>
                {t('Observed since', 'Beobachtet seit')}: {date(runtime?.observedSince)} ·{' '}
                {t('Last connection event', 'Letztes Verbindungsereignis')}:{' '}
                {date(runtime?.lastConnectionEventAt)}
              </Typography>
              <Typography>
                {t('Connection attempts', 'Verbindungsversuche')}: {number(runtime?.attempts)} ·{' '}
                {t('Connection losses', 'Verbindungsabbrüche')}: {number(runtime?.connectionLosses)}{' '}
                · {t('Successful reconnects', 'Erfolgreiche Wiederverbindungen')}:{' '}
                {number(runtime?.reconnects)}
              </Typography>
              <Typography>
                {t(
                  'Publishing interval, requested / revised',
                  'Veröffentlichungsintervall, angefordert / bestätigt',
                )}
                : {number(runtime?.requestedPublishingMs)} / {number(runtime?.revisedPublishingMs)}{' '}
                ms
              </Typography>
              <Typography>
                {t('Failed heartbeat reads', 'Fehlgeschlagene Kontrollabfragen')}:{' '}
                {number(runtime?.heartbeatFailures)} ·{' '}
                {t('Subscription errors', 'Abonnementfehler')}:{' '}
                {number(runtime?.subscriptionErrors)}
              </Typography>
            </Stack>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography variant="h6">
                {t('Durable collection for this machine', 'Dauerhafte Erfassung dieser Maschine')}
              </Typography>
              <Typography>
                {t('Pending measurements', 'Ausstehende Messwerte')}: {number(data.queue?.pending)}{' '}
                · {t('Oldest queued receipt', 'Ältester gepufferter Empfang')}:{' '}
                {date(data.queue?.oldestReceivedAt)}
              </Typography>
              <Typography>
                {t('Queued values without receive time', 'Gepufferte Werte ohne Empfangszeit')}:{' '}
                {number(data.queue?.unknownReceiveTimes)}
              </Typography>
              <Typography>
                {t('Refused storage writes', 'Abgewiesene Speicherungen')}:{' '}
                {number(data.ingestion?.rejected)} · {t('Observed since', 'Beobachtet seit')}:{' '}
                {date(data.ingestion?.observedSince)}
              </Typography>
              <Typography>
                {t('Last confirmed database write', 'Letzte bestätigte Datenbankspeicherung')}:{' '}
                {date(data.ingestion?.lastCommittedAt)}
              </Typography>
              <Typography>
                {t('Last refused write', 'Letzte abgewiesene Speicherung')}:{' '}
                {date(data.ingestion?.lastRejectedAt)}
              </Typography>
              <Typography color="text.secondary">
                {t(
                  'Pending values may already be stored while alarm evaluation catches up. Revised queue sizes are server limits, not observed queue occupancy.',
                  'Ausstehende Werte können bereits gespeichert sein, während die Alarmauswertung aufholt. Bestätigte Puffergrößen sind Servergrenzen und keine gemessene Pufferbelegung.',
                )}
              </Typography>
            </Stack>
          </Paper>
          <Typography variant="h6">{t('Mapped signals', 'Zugeordnete Signale')}</Typography>
          <Typography>
            {t('Stale after', 'Veraltet nach')}: {data.staleAfterSeconds} s ·{' '}
            {t(
              'Latest persisted evidence is shown separately from live observations.',
              'Zuletzt gespeicherte Nachweise werden getrennt von aktuellen Beobachtungen angezeigt.',
            )}
          </Typography>
          {data.signalsTruncated && (
            <Alert severity="warning">
              {t(
                'Only the first 500 signals are shown.',
                'Es werden nur die ersten 500 Signale angezeigt.',
              )}
            </Alert>
          )}
          {!data.signals.length && (
            <Typography>
              {t('No active signal mappings.', 'Keine aktiven Signalzuordnungen.')}
            </Typography>
          )}
          {data.signals.map((signal) => {
            const live = runtime?.signals.find((s) => s.key === signal.key);
            return (
              <Paper key={signal.key} sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Typography variant="h6">{signal.key}</Typography>
                  <Typography>
                    {t('Persisted freshness', 'Aktualität gespeicherter Daten')}:{' '}
                    {state(signal.freshness)} · {t('Receive age', 'Alter seit Empfang')}:{' '}
                    {number(signal.receiveAgeSeconds)} s
                  </Typography>
                  <Typography>
                    {t('Last stored observation', 'Letzte gespeicherte Beobachtung')}:{' '}
                    {date(signal.lastPersistedAt)} ·{' '}
                    {signal.statusCode ?? t('Unknown', 'Unbekannt')}
                  </Typography>
                  <Typography>
                    {t('Monitored item', 'Überwachtes Signal')}:{' '}
                    {live ? state(live.state) : t('Unknown', 'Unbekannt')} ·{' '}
                    {live?.statusCode ?? t('Unknown', 'Unbekannt')}
                  </Typography>
                  <Typography>
                    {t('Sampling, requested / revised', 'Abtastung, angefordert / bestätigt')}:{' '}
                    {number(live?.requestedSamplingMs ?? signal.requestedSamplingMs)} /{' '}
                    {number(live?.revisedSamplingMs)} ms
                  </Typography>
                  <Typography>
                    {t('Queue size, requested / revised', 'Puffergröße, angefordert / bestätigt')}:{' '}
                    {number(live?.requestedQueueSize)} / {number(live?.revisedQueueSize)}
                  </Typography>
                  <Typography>
                    {t('Latest observed receipt', 'Zuletzt beobachteter Empfang')}:{' '}
                    {date(live?.lastReceivedAt)} · {t('Source clock', 'Quellzeit')}:{' '}
                    {date(live?.lastSourceAt)}
                  </Typography>
                  <Typography>
                    {t(
                      'Observed / bad quality / overflow indications',
                      'Beobachtet / schlechte Qualität / Überlaufmeldungen',
                    )}
                    : {number(live?.observations)} / {number(live?.unusableObservations)} /{' '}
                    {number(live?.overflowIndications)}
                  </Typography>
                </Stack>
              </Paper>
            );
          })}
        </>
      )}
    </Stack>
  );
}
