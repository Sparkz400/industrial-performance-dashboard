import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import React, { useState } from 'react';
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { operationRequest, localInput, toIso } from './api';
interface Stage {
  machineId: number;
  stateKey: string;
  cycleKey: string;
  outputKey: string;
  states: Record<string, string>;
}
interface Buffer {
  from: number;
  to: number;
  machineId: number;
  nodeKey: string;
  capacity: number;
}
interface Line {
  id: number;
  config: { name: string };
}
interface Report {
  targetShortfall: number | null;
  observedOutput: number | null;
  uncertainty: string[];
  candidates: {
    machineId: number;
    lossSeconds: number;
    cycleP50Ms: number | null;
    coverage: number;
    upstreamBlockedSeconds: number;
    downstreamStarvedSeconds: number;
  }[];
  machines: {
    machineId: number;
    seconds: Record<string, number>;
    coverage: number;
    microstops: {
      count: number | null;
      seconds: number | null;
      resolutionSeconds: number | null;
      detectable: boolean | null;
    };
    cycles: {
      count: number;
      p50: number | null;
      p95: number | null;
      excluded: number;
      histogram: { fromMs: number; toMs: number; count: number }[];
    };
  }[];
  lossPareto: { machineId: number; state: string; seconds: number; cumulativeShare: number }[];
  buffers: {
    from: number;
    to: number;
    samples: number;
    emptyReadings: number;
    fullReadings: number;
  }[];
}
/**
 *
 */
export default function LinePanel() {
  const t = useT(),
    recovery = useAuthStore((s) => s.user?.recoveryMode);
  const stateName = (state: string) =>
    new Map(
      Object.entries({
        running: t('running', 'läuft'),
        idle: t('idle', 'Leerlauf'),
        fault: t('fault', 'Störung'),
        blocked: t('blocked', 'blockiert'),
        starved: t('starved', 'Materialmangel'),
        unknown: t('unknown', 'unbekannt'),
      }),
    ).get(state) ?? state;
  const [name, setName] = useState(''),
    [stages, setStages] = useState<Stage[]>([]),
    [buffers, setBuffers] = useState<Buffer[]>([]),
    [gap, setGap] = useState('60'),
    [stop, setStop] = useState('10'),
    [line, setLine] = useState('');
  const [start, setStart] = useState(localInput(new Date(Date.now() - 3600000).toISOString())),
    [end, setEnd] = useState(localInput(new Date().toISOString())),
    [target, setTarget] = useState('100'),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const assets = useQuery({
    queryKey: ['production-assets'],
    queryFn: () => operationRequest<{ id: number; name: string }[]>('/production/assets'),
  });
  const lines = useQuery({
    queryKey: ['production-lines'],
    queryFn: () => operationRequest<Line[]>('/lines'),
  });
  const machineName = (id: number) => assets.data?.find((a) => a.id === id)?.name ?? String(id);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const update = (index: number, value: Partial<Stage>) =>
    setStages(stages.map((s, i) => (i === index ? { ...s, ...value } : s)));
  return (
    <Stack
      spacing={2}
      sx={{ minWidth: 0, overflowWrap: 'anywhere', '& .MuiButton-root': { minHeight: 44 } }}
    >
      <Typography variant="h5">
        {t('Production line losses', 'Verluste der Produktionslinie')}
      </Typography>
      {(error || assets.error || lines.error) && (
        <Alert severity="error">{error || String(assets.error || lines.error)}</Alert>
      )}
      {lines.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
      {!lines.isLoading && !lines.error && !lines.data?.length && (
        <Typography>
          {t(
            'No production line is available for your assigned machines.',
            'Für Ihre zugewiesenen Maschinen ist keine Produktionslinie verfügbar.',
          )}
        </Typography>
      )}
      <TextField
        select
        label={t('Production line', 'Produktionslinie')}
        value={line}
        onChange={(e) => {
          setLine(e.target.value);
          setReport(null);
        }}
      >
        {(lines.data ?? []).map((l) => (
          <MenuItem key={l.id} value={l.id}>
            {l.config.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="datetime-local"
        label={t('Line report start', 'Beginn des Linienberichts')}
        slotProps={{ inputLabel: { shrink: true } }}
        value={start}
        onChange={(e) => {
          setStart(e.target.value);
          setReport(null);
        }}
      />
      <TextField
        type="datetime-local"
        label={t('Line report end', 'Ende des Linienberichts')}
        slotProps={{ inputLabel: { shrink: true } }}
        value={end}
        onChange={(e) => {
          setEnd(e.target.value);
          setReport(null);
        }}
      />
      <TextField
        type="number"
        label={t('Line output target', 'Ausbringungsziel der Linie')}
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
          setReport(null);
        }}
      />
      <Button
        disabled={busy || !line || !start || !end}
        onClick={() =>
          void run(async () =>
            setReport(
              await operationRequest(
                `/lines/${line}/report?${new URLSearchParams({ start: toIso(start), end: toIso(end), target })}`,
              ),
            ),
          )
        }
      >
        {t('Analyze line', 'Linie analysieren')}
      </Button>
      {report && (
        <>
          <Alert severity="info">
            {t('Observed output', 'Beobachtete Ausbringung')}:{' '}
            {report.observedOutput ?? t('Unknown', 'Unbekannt')} ·{' '}
            {t('Target shortfall', 'Zielabweichung')}:{' '}
            {report.targetShortfall ?? t('Unknown', 'Unbekannt')}
          </Alert>
          {report.uncertainty.map((s) => (
            <Typography
              key={s}
              sx={{
                color: 'text.secondary',
              }}
            >
              {t(
                s,
                new Map(
                  Object.entries({
                    'Candidates rank observed idle/fault time, then median cycle duration when at least 10 cycles are observed. Adjacent blocked/starved totals support investigation, not causal proof; cycle comparisons require equivalent work per cycle.':
                      'Kandidaten werden nach beobachtetem Leerlauf/Störung und dann nach der mittleren Zyklusdauer bei mindestens 10 Zyklen geordnet. Benachbarte Blockier- und Materialmangelzeiten unterstützen die Untersuchung, belegen aber keine Ursache. Zyklusvergleiche erfordern gleichwertige Arbeit pro Zyklus.',
                    'Buffer counts are sampled observations, not time occupancy. Cycle tag must emit one duration per completed cycle.':
                      'Pufferwerte sind einzelne Messungen, keine Belegungsdauer. Das Zyklussignal muss eine Dauer pro abgeschlossenem Zyklus liefern.',
                    'Line output is incomplete or no unique terminal machine exists; target shortfall is unknown.':
                      'Die Ausbringung ist unvollständig oder es gibt keine eindeutige Endmaschine; die Zielabweichung ist unbekannt.',
                    'Some machines have less than 80% state coverage; their bottleneck rank is withheld.':
                      'Einige Maschinen haben weniger als 80 % Zustandsabdeckung; für sie wird kein Engpassrang angezeigt.',
                  }),
                ).get(s),
              )}
            </Typography>
          ))}
          <Typography variant="h6">{t('Likely bottlenecks', 'Mögliche Engpässe')}</Typography>
          {!report.candidates.length && (
            <Typography>
              {t(
                'No candidate has sufficient supporting data.',
                'Für keinen Kandidaten liegen ausreichende Daten vor.',
              )}
            </Typography>
          )}
          {report.candidates.map((c) => (
            <Paper key={c.machineId} sx={{ p: 2 }}>
              <Typography>
                {machineName(c.machineId)} ·{' '}
                {t('observed idle/fault', 'beobachteter Leerlauf/Störung')} {c.lossSeconds}s ·{' '}
                {t('upstream blocked', 'vorgelagert blockiert')} {c.upstreamBlockedSeconds}s ·{' '}
                {t('downstream starved', 'nachgelagerter Materialmangel')}{' '}
                {c.downstreamStarvedSeconds}s ·{t('median cycle', 'Median der Zykluszeit')}{' '}
                {c.cycleP50Ms ?? t('Unknown', 'Unbekannt')} ms · {t('coverage', 'Abdeckung')}{' '}
                {(c.coverage * 100).toFixed(1)}%
              </Typography>
            </Paper>
          ))}
          {report.machines.map((m) => (
            <Paper key={m.machineId} sx={{ p: 2 }}>
              <Typography variant="h6">{machineName(m.machineId)}</Typography>
              <Typography>
                {Object.entries(m.seconds)
                  .map(([k, v]) => `${stateName(k)}: ${v.toFixed(1)}s`)
                  .join(' · ')}
              </Typography>
              <Typography>
                {t('Microstops', 'Mikrostopps')}:{' '}
                {m.microstops.detectable === false
                  ? t(
                      'not reported; the state is sampled too slowly for this threshold',
                      'nicht ausgewiesen; der Zustand wird für diese Schwelle zu selten abgetastet',
                    )
                  : `${m.microstops.count} / ${m.microstops.seconds}s`}
                {m.microstops.resolutionSeconds != null &&
                  ` (± ${m.microstops.resolutionSeconds}s ${t('sampling', 'Abtastung')})`}
                . {t('Cycle readings', 'Zyklusmessungen')}: {m.cycles.count},{' '}
                {t('excluded', 'ausgeschlossen')} {m.cycles.excluded}; {t('median', 'Median')}{' '}
                {m.cycles.p50 ?? t('Unknown', 'Unbekannt')} ms, p95{' '}
                {m.cycles.p95 ?? t('Unknown', 'Unbekannt')} ms.
              </Typography>
              {m.cycles.histogram.length > 0 && (
                <Box
                  component="table"
                  aria-label={t('Cycle time distribution', 'Verteilung der Zykluszeiten')}
                  sx={{ borderCollapse: 'collapse', fontSize: 13 }}
                >
                  <tbody>
                    {m.cycles.histogram.map((bin) => (
                      <tr key={bin.fromMs}>
                        <Box component="td" sx={{ pr: 1, whiteSpace: 'nowrap' }}>
                          {Math.round(bin.fromMs)}–{Math.round(bin.toMs)} ms
                        </Box>
                        <td style={{ width: '100%' }}>
                          <Box
                            sx={{
                              height: 10,
                              bgcolor: 'primary.main',
                              width: `${(bin.count / m.cycles.count) * 100}%`,
                            }}
                          />
                        </td>
                        <Box component="td" sx={{ pl: 1, textAlign: 'right' }}>
                          {bin.count}
                        </Box>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              )}
            </Paper>
          ))}
          {report.lossPareto.length > 0 && (
            <>
              <Typography variant="h6">{t('Loss Pareto', 'Verlust-Pareto')}</Typography>
              {report.lossPareto.map((loss) => (
                <Typography key={`${loss.machineId}-${loss.state}`}>
                  {machineName(loss.machineId)} · {stateName(loss.state)}: {loss.seconds.toFixed(1)}
                  s · {t('cumulative', 'kumuliert')} {(loss.cumulativeShare * 100).toFixed(0)}%
                </Typography>
              ))}
            </>
          )}
          {report.buffers.map((b, i) => (
            <Typography key={i}>
              {t('Buffer', 'Puffer')} {machineName(b.from)} → {machineName(b.to)}: {b.samples}{' '}
              {t('readings', 'Messungen')}, {b.emptyReadings} {t('empty', 'leer')}, {b.fullReadings}{' '}
              {t('full', 'voll')}.
            </Typography>
          ))}
        </>
      )}
      <Typography variant="h6">{t('Define a line', 'Linie definieren')}</Typography>
      <Alert severity="info">
        {t(
          'Map the actual machine state codes. Cycle tags must emit one duration in milliseconds per completed cycle. Save a new definition when mappings change.',
          'Ordnen Sie die tatsächlichen Maschinenzustände zu. Zyklussignale müssen eine Dauer in Millisekunden pro abgeschlossenem Zyklus liefern. Speichern Sie bei geänderten Zuordnungen eine neue Definition.',
        )}
      </Alert>
      <TextField
        label={t('Line name', 'Linienname')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        label={t('Maximum sample gap (seconds)', 'Maximale Messlücke (Sekunden)')}
        type="number"
        value={gap}
        onChange={(e) => setGap(e.target.value)}
      />
      <TextField
        label={t('Microstop limit (seconds)', 'Grenze für Mikrostopps (Sekunden)')}
        type="number"
        value={stop}
        onChange={(e) => setStop(e.target.value)}
      />
      {stages.map((s, i) => (
        <Paper key={i} sx={{ p: 2 }}>
          <Stack spacing={2}>
            <TextField
              select
              label={t(`Stage ${i + 1} machine`, `Stufe ${i + 1}: Maschine`)}
              value={s.machineId || ''}
              onChange={(e) => update(i, { machineId: Number(e.target.value) })}
            >
              {(assets.data ?? []).map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={t(`Stage ${i + 1} state tag`, `Stufe ${i + 1}: Zustandssignal`)}
              value={s.stateKey}
              onChange={(e) => update(i, { stateKey: e.target.value })}
            />
            <TextField
              label={t(
                `Stage ${i + 1} cycle duration tag (optional)`,
                `Stufe ${i + 1}: Zyklusdauersignal (optional)`,
              )}
              value={s.cycleKey}
              onChange={(e) => update(i, { cycleKey: e.target.value })}
            />
            <TextField
              label={t(
                `Stage ${i + 1} output counter tag (optional)`,
                `Stufe ${i + 1}: Ausbringungszähler (optional)`,
              )}
              value={s.outputKey}
              onChange={(e) => update(i, { outputKey: e.target.value })}
            />
            {Object.entries(s.states).map(([state, codes]) => (
              <TextField
                key={state}
                label={t(
                  `Stage ${i + 1} ${state} codes, comma separated`,
                  `Stufe ${i + 1}: ${stateName(state)}-Codes, kommagetrennt`,
                )}
                value={codes}
                onChange={(e) =>
                  update(i, {
                    states: Object.fromEntries(
                      Object.entries(s.states).map(([name, value]) => [
                        name,
                        name === state ? e.target.value : value,
                      ]),
                    ),
                  })
                }
              />
            ))}
            <Button onClick={() => setStages(stages.filter((_, n) => n !== i))}>
              {t('Remove stage', 'Stufe entfernen')} {i + 1}
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          setStages([
            ...stages,
            {
              machineId: 0,
              stateKey: '',
              cycleKey: '',
              outputKey: '',
              states: { running: '1', idle: '0', fault: '2', blocked: '3', starved: '4' },
            },
          ])
        }
      >
        {t('Add machine stage', 'Maschinenstufe hinzufügen')}
      </Button>
      {buffers.map((b, i) => (
        <Paper key={i} sx={{ p: 2 }}>
          <Stack spacing={2}>
            {(
              [
                ['from', b.from],
                ['to', b.to],
                ['machineId', b.machineId],
              ] as const
            ).map(([field, value]) => (
              <TextField
                select
                key={field}
                label={t(
                  `Buffer ${i + 1} ${field === 'from' ? 'upstream machine' : field === 'to' ? 'downstream machine' : 'measurement machine'}`,
                  `Puffer ${i + 1}: ${field === 'from' ? 'vorgelagerte Maschine' : field === 'to' ? 'nachgelagerte Maschine' : 'Messmaschine'}`,
                )}
                value={value || ''}
                onChange={(e) =>
                  setBuffers(
                    buffers.map((x, n) =>
                      n === i ? { ...x, [field]: Number(e.target.value) } : x,
                    ),
                  )
                }
              >
                {stages
                  .filter((s) => s.machineId)
                  .map((s) => (
                    <MenuItem key={s.machineId} value={s.machineId}>
                      {machineName(s.machineId)}
                    </MenuItem>
                  ))}
              </TextField>
            ))}
            <TextField
              label={t(`Buffer ${i + 1} occupancy tag`, `Puffer ${i + 1}: Belegungssignal`)}
              value={b.nodeKey}
              onChange={(e) =>
                setBuffers(buffers.map((x, n) => (n === i ? { ...x, nodeKey: e.target.value } : x)))
              }
            />
            <TextField
              label={t(`Buffer ${i + 1} capacity`, `Puffer ${i + 1}: Kapazität`)}
              type="number"
              value={b.capacity}
              onChange={(e) =>
                setBuffers(
                  buffers.map((x, n) => (n === i ? { ...x, capacity: Number(e.target.value) } : x)),
                )
              }
            />
            <Button onClick={() => setBuffers(buffers.filter((_, n) => n !== i))}>
              {t('Remove buffer', 'Puffer entfernen')} {i + 1}
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          setBuffers([...buffers, { from: 0, to: 0, machineId: 0, nodeKey: '', capacity: 10 }])
        }
      >
        {t('Add connecting buffer', 'Verbindungspuffer hinzufügen')}
      </Button>
      <Button
        disabled={busy || recovery || !name || stages.length < 2}
        onClick={() =>
          void run(async () => {
            const saved = await operationRequest<Line>('/lines', 'POST', {
              name,
              maxGapSeconds: Number(gap),
              microstopSeconds: Number(stop),
              machines: stages.map((s) => ({
                ...s,
                states: Object.fromEntries(
                  Object.entries(s.states).map(([state, codes]) => [
                    state,
                    codes.trim()
                      ? codes.split(',').map((code) => (code.trim() ? Number(code) : NaN))
                      : [],
                  ]),
                ),
                cycleKey: s.cycleKey || null,
                outputKey: s.outputKey || null,
              })),
              buffers,
            });
            await lines.refetch();
            setLine(String(saved.id));
            setReport(null);
          })
        }
      >
        {t('Save line definition', 'Liniendefinition speichern')}
      </Button>
    </Stack>
  );
}
