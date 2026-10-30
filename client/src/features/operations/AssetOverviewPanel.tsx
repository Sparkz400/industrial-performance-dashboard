import React, { useState } from 'react';
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useT, useLanguage } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  useTwinInstance,
  useTwinInstances,
  type TwinNodeBinding,
} from '../digital-twin/hooks/useDigitalTwinQueries';
import { useDigitalTwinLiveData } from '../digital-twin/hooks/useDigitalTwinLiveData';
import SvgViewer from '../digital-twin/components/SvgViewer';
import { operationRequest, localInput, toIso } from './api';
import MaintenancePanel from './MaintenancePanel';
import TrendingExplorerWidgetView from '../widgets/types/trending-explorer/TrendingExplorerWidgetView';
import { toChartSeries } from '../widgets/types/trending-explorer/useTrendingData';
import type { TrendingSeries } from '@performance-dashboard/shared';
import { downloadJson } from '../production/CommissioningPanel';

/**
 * Read-only asset navigation using configured SVG bindings and scoped measurements.
 * @param root0
 * @param root0.machineId
 * @param root0.initialInstanceId
 */
export default function AssetOverviewPanel({
  machineId,
  initialInstanceId = 0,
}: {
  machineId: number;
  initialInstanceId?: number;
}) {
  const t = useT(),
    language = useLanguage((s) => s.language),
    admin = useAuthStore((s) => s.user?.role === 'admin');
  const instances = useTwinInstances(machineId);
  const [selected, setSelected] = useState(initialInstanceId),
    [binding, setBinding] = useState<TwinNodeBinding | null>(null),
    [view, setView] = useState<'details' | 'history' | 'alarms' | 'maintenance'>('details');
  const [range, setRange] = useState(() => ({
    start: localInput(new Date(Date.now() - 3600000).toISOString()),
    end: localInput(new Date().toISOString()),
  }));
  const id = selected || instances.data?.[0]?.id || 0;
  const instance = useTwinInstance(id);
  const asset = instance.data;
  const live = useDigitalTwinLiveData(
    asset?.values ?? {},
    asset?.connection ?? 'unknown',
    !instance.error,
  );
  const currentBinding = asset?.bindings.find((b) => b.elementId === binding?.elementId) ?? null;
  const reading = currentBinding ? live[currentBinding.nodeKey] : undefined;
  const validRange =
    Number.isFinite(Date.parse(range.start)) &&
    Number.isFinite(Date.parse(range.end)) &&
    Date.parse(range.end) > Date.parse(range.start);
  const history = useQuery({
    queryKey: ['asset-history', id, currentBinding?.elementId, range],
    enabled: view === 'history' && !!currentBinding && validRange,
    queryFn: () =>
      operationRequest<{ series: TrendingSeries | null }>(
        `/digital-twins/instances/${id}/element-history?${new URLSearchParams({ elementId: currentBinding!.elementId, startDate: toIso(range.start), endDate: toIso(range.end) })}`,
      ),
  });
  const alarms = useQuery({
    queryKey: ['asset-alarms', machineId, currentBinding?.nodeKey],
    enabled: view === 'alarms' && !!currentBinding,
    refetchInterval: 10000,
    queryFn: () =>
      operationRequest<
        { id: number; message: string; status: string; severity: string; createdAt: string }[]
      >(
        `/alarms?${new URLSearchParams({ machineId: String(machineId), nodeKey: currentBinding!.nodeKey, limit: '101' })}`,
      ),
  });
  const pick = (next: TwinNodeBinding) => {
    setBinding(next);
    setView('details');
  };
  const freshness = new Map([
    ['fresh', t('Fresh', 'Aktuell')],
    ['stale', t('Stale', 'Veraltet')],
    ['unknown', t('Unknown')],
    ['bad-quality', t('Bad quality', 'Ungültige Qualität')],
    ['clock-skew', t('Clock mismatch', 'Zeitabweichung')],
    ['disconnected', t('Disconnected', 'Getrennt')],
    ['unavailable', t('Unavailable', 'Nicht verfügbar')],
  ]);
  const value = (input: unknown) =>
    input == null
      ? t('Unknown')
      : typeof input === 'number'
        ? input.toLocaleString(language, { maximumFractionDigits: 4 })
        : String(input);
  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="h5">{t('Asset overview', 'Anlagenübersicht')}</Typography>
      <Alert severity="info">
        {t(
          'Select an element to inspect its signal, alarms, history or machine maintenance. Readings refresh every five seconds; readings older than 60 seconds are not current. This view does not control equipment or simulate the process.',
          'Ein Element auswählen, um Signal, Alarme, Verlauf oder Maschinenwartung zu prüfen. Werte werden alle fünf Sekunden aktualisiert; Werte über 60 Sekunden sind nicht aktuell. Diese Ansicht steuert keine Geräte und simuliert keinen Prozess.',
        )}
      </Alert>
      {[instances.error, instance.error, history.error, alarms.error]
        .filter(Boolean)
        .map((error, i) => (
          <Alert severity="error" key={i}>
            {String(error)}
          </Alert>
        ))}
      {instances.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
      {!instances.isLoading && !instances.data?.length && (
        <Alert severity="info">
          {t(
            'No SVG layout is configured for this machine. Ask an administrator to create a template and bind its elements to machine signals.',
            'Für diese Maschine ist kein SVG-Layout eingerichtet. Eine Administration muss eine Vorlage erstellen und deren Elemente mit Maschinensignalen verbinden.',
          )}
        </Alert>
      )}
      {admin && (
        <Button href="/digital-twins">
          {t('Configure layouts and bindings', 'Layouts und Zuordnungen einrichten')}
        </Button>
      )}
      {!!instances.data?.length && (
        <TextField
          select
          label={t('Asset layout', 'Anlagenlayout')}
          value={id}
          onChange={(event) => {
            setSelected(Number(event.target.value));
            setBinding(null);
            setView('details');
          }}
        >
          {instances.data.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {row.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      {asset && (
        <>
          <Typography>
            {asset.name} · {asset.machineName} · {t('Connection', 'Verbindung')}:{' '}
            {asset.connection === 'connected'
              ? t('Connected', 'Verbunden')
              : t('Not connected', 'Nicht verbunden')}
          </Typography>
          <Paper sx={{ height: { xs: 280, md: 420 }, p: 1, minWidth: 0 }}>
            <SvgViewer
              svgContent={asset.svgContent}
              bindings={asset.bindings}
              liveData={live}
              onElementClick={pick}
            />
          </Paper>
          <Stack
            direction="row"
            useFlexGap
            spacing={1}
            aria-label={t('Asset elements', 'Anlagenelemente')}
            sx={{
              flexWrap: 'wrap',
            }}
          >
            {asset.bindings.map((item) => (
              <Button
                key={item.elementId}
                variant={currentBinding?.elementId === item.elementId ? 'contained' : 'outlined'}
                onClick={() => pick(item)}
                sx={{ minHeight: 44 }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          {currentBinding && (
            <Paper sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="h6">{currentBinding.label}</Typography>
                <Typography>
                  {t('Current value', 'Aktueller Wert')}: {value(reading?.value)}{' '}
                  {reading?.value != null ? currentBinding.unit : ''} ·{' '}
                  {freshness.get(reading?.freshness ?? 'unknown')}
                </Typography>
                <Typography>
                  {t('Signal', 'Signal')}: {currentBinding.nodeKey} ·{' '}
                  {t('Source quality', 'Quellqualität')}: {reading?.statusCode ?? t('Unknown')}
                </Typography>
                <Typography>
                  {t('Last raw reading', 'Letzter Rohwert')}: {value(reading?.rawValue)} ·{' '}
                  {reading?.timestamp
                    ? new Date(reading.timestamp).toLocaleString(language)
                    : t('Unknown')}
                </Typography>
                <Typography>
                  {t('Received at', 'Empfangen um')}:{' '}
                  {reading?.receivedAt
                    ? new Date(reading.receivedAt).toLocaleString(language)
                    : t('Unknown')}
                </Typography>
                <Stack
                  direction="row"
                  useFlexGap
                  spacing={1}
                  sx={{
                    flexWrap: 'wrap',
                  }}
                >
                  <Button onClick={() => setView('history')}>
                    {t('Open signal history', 'Signalverlauf öffnen')}
                  </Button>
                  <Button onClick={() => setView('alarms')}>
                    {t('Open signal alarms', 'Signalalarme öffnen')}
                  </Button>
                  <Button onClick={() => setView('maintenance')}>
                    {t('Open machine maintenance', 'Maschinenwartung öffnen')}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}
          {view === 'history' && currentBinding && (
            <Stack spacing={2}>
              <Typography variant="h6">
                {t('Signal history', 'Signalverlauf')} · {currentBinding.label}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label={t('History start', 'Verlaufsbeginn')}
                  type="datetime-local"
                  value={range.start}
                  onChange={(e) => setRange({ ...range, start: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label={t('History end', 'Verlaufsende')}
                  type="datetime-local"
                  value={range.end}
                  onChange={(e) => setRange({ ...range, end: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>
              {!validRange && (
                <Alert severity="warning">
                  {t('Choose an end after the start.', 'Ein Ende nach dem Beginn wählen.')}
                </Alert>
              )}
              <Typography>
                {t(
                  'Numeric history keeps bad quality as gaps. Resolution and sample counts describe the returned window; Boolean and text readings remain visible above.',
                  'Numerische Verläufe zeigen ungültige Qualität als Lücken. Auflösung und Messwertanzahl beschreiben den angezeigten Zeitraum; boolesche und Textwerte bleiben oben sichtbar.',
                )}
              </Typography>
              <Box
                role="region"
                aria-label={t('Signal history chart', 'Signalverlaufsdiagramm')}
                sx={{ height: 320, minWidth: 0 }}
              >
                <TrendingExplorerWidgetView
                  series={
                    history.data?.series ? toChartSeries({ series: [history.data.series] }) : []
                  }
                  isLoading={history.isLoading}
                />
              </Box>
              <Button
                disabled={!history.data}
                onClick={() => downloadJson(history.data, `asset-${id}-history.json`)}
              >
                {t('Download signal evidence', 'Signalnachweise herunterladen')}
              </Button>
            </Stack>
          )}
          {view === 'alarms' && currentBinding && (
            <Stack spacing={1}>
              <Typography variant="h6">
                {t('Signal alarms', 'Signalalarme')} · {currentBinding.label}
              </Typography>
              {alarms.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
              {alarms.data?.length === 0 && (
                <Typography>
                  {t(
                    'No recorded alarms for this signal.',
                    'Keine dokumentierten Alarme für dieses Signal.',
                  )}
                </Typography>
              )}
              {alarms.data?.slice(0, 100).map((alarm) => (
                <Paper key={alarm.id} sx={{ p: 2 }}>
                  <Typography>{alarm.message}</Typography>
                  <Typography>
                    #{alarm.id} · {alarm.severity} · {alarm.status} ·{' '}
                    {new Date(alarm.createdAt).toLocaleString(language)}
                  </Typography>
                </Paper>
              ))}
              {(alarms.data?.length ?? 0) > 100 && (
                <Alert severity="warning">
                  {t(
                    'Only the latest 100 alarms are shown.',
                    'Es werden nur die letzten 100 Alarme angezeigt.',
                  )}
                </Alert>
              )}
            </Stack>
          )}
          {view === 'maintenance' && <MaintenancePanel machineId={machineId} />}
        </>
      )}
    </Stack>
  );
}
