import React, { useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
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
    microstops: { count: number; seconds: number };
    cycles: { count: number; p50: number | null; p95: number | null; excluded: number };
  }[];
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
    <Stack spacing={2}>
      <Typography variant="h5">Production line losses</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        select
        label="Production line"
        value={line}
        onChange={(e) => {
          setLine(e.target.value);
          setReport(null);
        }}
      >
        {lines.data?.map((l) => (
          <MenuItem key={l.id} value={l.id}>
            {l.config.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="datetime-local"
        label="Line report start"
        slotProps={{ inputLabel: { shrink: true } }}
        value={start}
        onChange={(e) => {
          setStart(e.target.value);
          setReport(null);
        }}
      />
      <TextField
        type="datetime-local"
        label="Line report end"
        slotProps={{ inputLabel: { shrink: true } }}
        value={end}
        onChange={(e) => {
          setEnd(e.target.value);
          setReport(null);
        }}
      />
      <TextField
        type="number"
        label="Line output target"
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
        Analyze line
      </Button>
      {report && (
        <>
          <Alert severity="info">
            Observed output: {report.observedOutput ?? 'Unknown'} · Target shortfall:{' '}
            {report.targetShortfall ?? 'Unknown'}
          </Alert>
          {report.uncertainty.map((s) => (
            <Typography key={s} color="text.secondary">
              {s}
            </Typography>
          ))}
          <Typography variant="h6">Likely bottlenecks</Typography>
          {!report.candidates.length && (
            <Typography>No candidate has sufficient supporting data.</Typography>
          )}
          {report.candidates.map((c) => (
            <Paper key={c.machineId} sx={{ p: 2 }}>
              <Typography>
                {machineName(c.machineId)} · observed idle/fault {c.lossSeconds}s · upstream blocked{' '}
                {c.upstreamBlockedSeconds}s · downstream starved {c.downstreamStarvedSeconds}s ·
                median cycle {c.cycleP50Ms ?? 'Unknown'} ms · coverage{' '}
                {(c.coverage * 100).toFixed(1)}%
              </Typography>
            </Paper>
          ))}
          {report.machines.map((m) => (
            <Paper key={m.machineId} sx={{ p: 2 }}>
              <Typography variant="h6">{machineName(m.machineId)}</Typography>
              <Typography>
                {Object.entries(m.seconds)
                  .map(([k, v]) => `${k}: ${v.toFixed(1)}s`)
                  .join(' · ')}
              </Typography>
              <Typography>
                Microstops: {m.microstops.count} / {m.microstops.seconds}s. Cycle readings:{' '}
                {m.cycles.count}, excluded {m.cycles.excluded}; median {m.cycles.p50 ?? 'Unknown'}{' '}
                ms, p95 {m.cycles.p95 ?? 'Unknown'} ms.
              </Typography>
            </Paper>
          ))}
          {report.buffers.map((b, i) => (
            <Typography key={i}>
              Buffer {machineName(b.from)} → {machineName(b.to)}: {b.samples} readings,{' '}
              {b.emptyReadings} empty, {b.fullReadings} full.
            </Typography>
          ))}
        </>
      )}
      <Typography variant="h6">Define a line</Typography>
      <Alert severity="info">
        Map the actual machine state codes. Cycle tags must emit one duration in milliseconds per
        completed cycle. Save a new definition when mappings change.
      </Alert>
      <TextField label="Line name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="Maximum sample gap (seconds)"
        type="number"
        value={gap}
        onChange={(e) => setGap(e.target.value)}
      />
      <TextField
        label="Microstop limit (seconds)"
        type="number"
        value={stop}
        onChange={(e) => setStop(e.target.value)}
      />
      {stages.map((s, i) => (
        <Paper key={i} sx={{ p: 2 }}>
          <Stack spacing={2}>
            <TextField
              select
              label={`Stage ${i + 1} machine`}
              value={s.machineId || ''}
              onChange={(e) => update(i, { machineId: Number(e.target.value) })}
            >
              {assets.data?.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={`Stage ${i + 1} state tag`}
              value={s.stateKey}
              onChange={(e) => update(i, { stateKey: e.target.value })}
            />
            <TextField
              label={`Stage ${i + 1} cycle duration tag (optional)`}
              value={s.cycleKey}
              onChange={(e) => update(i, { cycleKey: e.target.value })}
            />
            <TextField
              label={`Stage ${i + 1} output counter tag (optional)`}
              value={s.outputKey}
              onChange={(e) => update(i, { outputKey: e.target.value })}
            />
            {Object.entries(s.states).map(([state, codes]) => (
              <TextField
                key={state}
                label={`Stage ${i + 1} ${state} codes, comma separated`}
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
              Remove stage {i + 1}
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
        Add machine stage
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
                label={`Buffer ${i + 1} ${field === 'from' ? 'upstream machine' : field === 'to' ? 'downstream machine' : 'measurement machine'}`}
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
              label={`Buffer ${i + 1} occupancy tag`}
              value={b.nodeKey}
              onChange={(e) =>
                setBuffers(buffers.map((x, n) => (n === i ? { ...x, nodeKey: e.target.value } : x)))
              }
            />
            <TextField
              label={`Buffer ${i + 1} capacity`}
              type="number"
              value={b.capacity}
              onChange={(e) =>
                setBuffers(
                  buffers.map((x, n) => (n === i ? { ...x, capacity: Number(e.target.value) } : x)),
                )
              }
            />
            <Button onClick={() => setBuffers(buffers.filter((_, n) => n !== i))}>
              Remove buffer {i + 1}
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          setBuffers([...buffers, { from: 0, to: 0, machineId: 0, nodeKey: '', capacity: 10 }])
        }
      >
        Add connecting buffer
      </Button>
      <Button
        disabled={busy || !name || stages.length < 2}
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
        Save line definition
      </Button>
    </Stack>
  );
}
