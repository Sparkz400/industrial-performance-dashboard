import { translate as t, useLanguage } from '@/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  replayObservation,
  replayPoints,
  type IncidentReplay,
} from '@performance-dashboard/shared';
import { productionRequest, downloadJson } from './productionApi';
import TrendingExplorerWidgetView from '@/features/widgets/types/trending-explorer/TrendingExplorerWidgetView';

/** Review a bounded historical snapshot without changing operational data. */
export default function IncidentReplayPanel() {
  useLanguage((s) => s.language);
  // A service record's trend link prefills the window; nothing loads until Replay is chosen.
  const [params] = useSearchParams();
  const [machine, setMachine] = useState(params.get('machine') ?? '');
  const [keys, setKeys] = useState(
    params.get('keys')?.split(',').join(', ') ?? 'ProductionState, ProductionCount',
  );
  const [start, setStart] = useState(
    params.get('start') ?? new Date(Date.now() - 3600000).toISOString(),
  );
  const [end, setEnd] = useState(params.get('end') ?? new Date().toISOString());
  const [gap, setGap] = useState('60');
  const [data, setData] = useState<IncidentReplay | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [eventPage, setEventPage] = useState(0);
  const assets = useQuery({
    queryKey: ['production-assets'],
    queryFn: () => productionRequest<{ id: number; name: string }[]>('/assets'),
  });
  const reset = () => {
    setData(null);
    setPlaying(false);
    setError('');
  };
  useEffect(() => {
    if (!playing || !data) return;
    const timer = setInterval(
      () => setCursor((value) => Math.min(Date.parse(data.end), value + 15000)),
      250,
    );
    return () => clearInterval(timer);
  }, [playing, data]);
  useEffect(() => {
    if (data && cursor >= Date.parse(data.end)) setPlaying(false);
  }, [cursor, data]);
  const series = useMemo(
    () =>
      data?.signals.map((signal) => ({
        id: signal.key,
        nodeKey: signal.key,
        displayName: signal.key,
        data: replayPoints(signal.samples, data.start, data.end, data.maxGapSeconds),
        truncated: signal.truncated,
        sampleCount: signal.samples.length,
        goodSampleCount: signal.samples.filter(
          (sample) => sample.quality?.startsWith('Good') && sample.value !== null,
        ).length,
        legacySampleCount: signal.samples.filter((sample) => !sample.identity).length,
        observedEnd: signal.samples.at(-1)?.at ?? null,
      })) ?? [],
    [data],
  );
  const seek = (at: string) => {
    if (data) {
      setPlaying(false);
      setCursor(Math.max(Date.parse(data.start), Math.min(Date.parse(data.end), Date.parse(at))));
    }
  };
  return (
    <Stack spacing={2} sx={{ pt: 2, minWidth: 0 }}>
      <Typography variant="h5">{t('Incident replay')} </Typography>
      <Typography>
        {t(
          'Review recorded observations, alarm transitions and operator history together. Nearby events are investigation leads; they do not establish a cause.',
        )}{' '}
      </Typography>
      <Stack
        direction="row"
        sx={{
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <TextField
          select
          label={t('Replay machine')}
          value={machine}
          disabled={busy}
          sx={{ minWidth: 220 }}
          onChange={(event) => {
            reset();
            setMachine(event.target.value);
          }}
        >
          {(assets.data ?? []).map((asset) => (
            <MenuItem key={asset.id} value={asset.id}>
              {asset.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('Signal keys (comma separated, up to 8)')}
          value={keys}
          disabled={busy}
          sx={{ flex: '1 1 300px' }}
          onChange={(event) => {
            reset();
            setKeys(event.target.value);
          }}
        />
        <TextField
          label={t('Unknown after (seconds)')}
          type="number"
          value={gap}
          disabled={busy}
          onChange={(event) => {
            reset();
            setGap(event.target.value);
          }}
        />
        <TextField
          label={t('Replay start (ISO with offset)')}
          value={start}
          disabled={busy}
          sx={{ flex: '1 1 290px' }}
          onChange={(event) => {
            reset();
            setStart(event.target.value);
          }}
        />
        <TextField
          label={t('Replay end (ISO with offset)')}
          value={end}
          disabled={busy}
          sx={{ flex: '1 1 290px' }}
          onChange={(event) => {
            reset();
            setEnd(event.target.value);
          }}
        />
        <Button
          variant="contained"
          disabled={busy || !machine}
          onClick={async () => {
            reset();
            setBusy(true);
            try {
              const params = new URLSearchParams({ start, end, maxGapSeconds: gap });
              keys
                .split(',')
                .map((key) => key.trim())
                .filter(Boolean)
                .forEach((key) => params.append('keys', key));
              const result = await productionRequest<IncidentReplay>(
                `/replay/${machine}?${params}`,
              );
              setData(result);
              setCursor(Date.parse(result.start));
              setEventPage(0);
            } catch (failure) {
              setError(String(failure));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t('Loading observations…') : t('Load replay')}
        </Button>
      </Stack>
      {(error || assets.error) && <Alert severity="error">{error || String(assets.error)}</Alert>}
      {data && (
        <>
          <Alert severity="info">
            {t(
              'History uses stored observation time. Source and receive clocks are shown separately and may differ. Missing source time or identity stays unknown. The gap threshold is a review setting, not a production profile change.',
            )}{' '}
          </Alert>
          {(data.signals.some((signal) => signal.truncated) ||
            Object.values(data.truncated).some(Boolean)) && (
            <Alert severity="warning">
              {t(
                'Replay is truncated. Narrow the time window: limits are 2,000 samples per signal and 200 records per event category. Exports contain the same bounded result.',
              )}{' '}
            </Alert>
          )}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">
              {data.machine.name} {t('· full window trends')}{' '}
            </Typography>
            <Box sx={{ height: 370, minWidth: 0 }}>
              <TrendingExplorerWidgetView series={series} isLoading={false} />
            </Box>
            <Stack
              direction="row"
              sx={{
                gap: 1,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <Button
                onClick={() => {
                  if (cursor >= Date.parse(data.end)) setCursor(Date.parse(data.start));
                  setPlaying(!playing);
                }}
              >
                {playing ? t('Pause replay') : t('Play at 60×')}
              </Button>
              <Button onClick={() => seek(data.start)}>{t('Start of window')} </Button>
              <Button onClick={() => downloadJson(data, `incident-replay-${data.machine.id}.json`)}>
                {t('Export replay JSON')}{' '}
              </Button>
              <Typography component="output" aria-label={t('Replay cursor')}>
                {new Date(cursor).toISOString()}
              </Typography>
            </Stack>
            <Slider
              aria-label={t('Replay position')}
              min={Date.parse(data.start)}
              max={Date.parse(data.end)}
              step={1000}
              value={cursor}
              getAriaValueText={(value) => new Date(value).toISOString()}
              onChange={(_, value) => {
                setPlaying(false);
                setCursor(value as number);
              }}
            />
          </Paper>
          <Typography variant="h6">{t('Observations at cursor')} </Typography>
          <Stack
            direction="row"
            sx={{
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            {data.signals.map((signal) => {
              const observation = replayObservation(signal.samples, cursor, data.maxGapSeconds),
                sample = observation.sample;
              return (
                <Paper
                  key={signal.key}
                  sx={{ p: 2, flex: '1 1 300px', minWidth: 0, overflowWrap: 'anywhere' }}
                  aria-label={`Replay observation ${signal.key}`}
                >
                  <Typography variant="h6">{signal.key}</Typography>
                  <Typography variant="h5">
                    {observation.known ? String(sample?.raw ?? sample?.value) : t('Unknown')}
                  </Typography>
                  <Chip
                    size="small"
                    label={observation.reason}
                    color={observation.known ? 'default' : 'warning'}
                  />
                  <Typography variant="body2">
                    {t('Quality:')} {sample?.quality ?? 'Unknown'} {t('· Unit:')}{' '}
                    {sample?.identity?.unit ?? 'Unknown'}
                  </Typography>
                  <Typography variant="body2">
                    {t('Observation:')} {sample?.at ?? 'None'}
                  </Typography>
                  <Typography variant="body2">
                    {t('Source:')} {sample?.sourceAt ?? 'Unknown'}
                  </Typography>
                  <Typography variant="body2">
                    {t('Received:')} {sample?.receivedAt ?? 'Unknown'}
                  </Typography>
                  {sample && !observation.known && (
                    <Typography variant="body2">
                      {t('Last raw value (not current):')}{' '}
                      {String(sample.raw ?? sample.value ?? 'Unknown')}
                    </Typography>
                  )}
                  {sample?.rawTruncated && (
                    <Typography
                      sx={{
                        color: 'warning.main',
                      }}
                    >
                      {t('Raw text shortened to 512 characters.')}{' '}
                    </Typography>
                  )}
                  <Typography variant="caption">
                    {sample?.identity
                      ? `${sample.identity.namespaceUri} · ${sample.identity.identifier} · mapping ${sample.identity.mappingRevision ?? 'Unknown'}`
                      : t('Source identity unknown')}
                  </Typography>
                </Paper>
              );
            })}
          </Stack>
          <Typography variant="h6">
            {t('Recorded events and annotations (')}
            {data.events.length})
          </Typography>
          <Typography variant="body2">
            {t(
              'Opening alarms before the window and later stop classifications are included as context. Every operator revision retains its recorded time and author. Classification corrections retain the replaced record.',
            )}{' '}
          </Typography>
          {data.events.length === 0 && (
            <Alert severity="info">
              {t(
                'No recorded events in this result. Absence of events does not prove normal operation.',
              )}{' '}
            </Alert>
          )}
          {data.events.slice(eventPage * 50, (eventPage + 1) * 50).map((event) => (
            <Paper key={event.id} sx={{ p: 2, overflowWrap: 'anywhere' }}>
              <Stack
                direction="row"
                sx={{
                  gap: 1,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <Chip size="small" label={event.kind} />
                <Button onClick={() => seek(event.at)} aria-label={`Review event ${event.id}`}>
                  {event.at}
                </Button>
                <Typography variant="caption">
                  {event.clock} {t('time · actor')} {event.actorId ?? 'system'}
                </Typography>
                {(event.at < data.start || event.at > data.end) && (
                  <Chip size="small" label={t('Outside window context')} />
                )}
              </Stack>
              <Typography>{event.text}</Typography>
              {event.sourceAt && (
                <Typography variant="body2">
                  {t('Source:')} {event.sourceAt}
                </Typography>
              )}
              <details>
                <summary>{t('Recorded details')} </summary>
                <Box component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(event.details, null, 2)}
                </Box>
              </details>
            </Paper>
          ))}
          {data.events.length > 50 && (
            <Stack
              direction="row"
              sx={{
                gap: 1,
              }}
            >
              <Button disabled={eventPage === 0} onClick={() => setEventPage(eventPage - 1)}>
                {t('Previous events')}{' '}
              </Button>
              <Typography>
                {t('Page')} {eventPage + 1} {t('of')} {Math.ceil(data.events.length / 50)}
              </Typography>
              <Button
                disabled={(eventPage + 1) * 50 >= data.events.length}
                onClick={() => setEventPage(eventPage + 1)}
              >
                {t('Next events')}{' '}
              </Button>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
