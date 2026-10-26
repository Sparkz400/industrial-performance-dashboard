/* eslint-disable security/detect-object-injection -- Dynamic keys below come from fixed field/role lists; imported profiles are validated by the API. */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ShiftReport, DowntimeReason } from '@performance-dashboard/shared';
import { useAuthStore } from '@/stores/useAuthStore';
import CommissioningPanel, { productionRequest, downloadJson } from './CommissioningPanel';

interface Shift {
  id: number;
  name: string;
  machineId: number;
  start: string;
  end: string;
}
const iso = (time: number) => new Date(time).toISOString();
const percent = (value: number | null) =>
  value == null ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
const number = (value: number | null) => (value == null ? 'Unknown' : value.toLocaleString());

/**
 *
 */
export default function ProductionPage() {
  const admin = useAuthStore((s) => s.user?.role === 'admin');
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    machineId: '',
    name: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    start: iso(Date.now() - 3600000),
    end: iso(Date.now()),
    job: { reference: '', product: '', target: '' },
  });
  const [breaks, setBreaks] = useState<{ start: string; end: string }[]>([]);
  const [reason, setReason] = useState<{
    start: string;
    end: string;
    category: 'planned' | 'unplanned';
    reason: string;
    supersedesId: number | null;
  }>({ start: '', end: '', category: 'unplanned', reason: '', supersedesId: null });
  const [evidence, setEvidence] = useState({ total: '', good: '', reject: '', reference: '' });
  const assets = useQuery({
    queryKey: ['production-assets'],
    queryFn: () => productionRequest<{ id: number; name: string; status: string }[]>('/assets'),
  });
  const health = useQuery({
    queryKey: ['collector-health'],
    queryFn: () =>
      productionRequest<{
        pendingMeasurements: number;
        storageFailure: { at: string; message: string } | null;
      }>('/health'),
    enabled: admin,
    refetchInterval: 5000,
  });
  const shifts = useQuery({
    queryKey: ['production-shifts'],
    queryFn: () => productionRequest<Shift[]>('/shifts'),
  });
  const report = useQuery({
    queryKey: ['shift-report', selected],
    queryFn: () => productionRequest<ShiftReport>(`/shifts/${selected}/report`),
    enabled: !!selected,
    refetchInterval: 5000,
  });
  useEffect(() => {
    setReason({ start: '', end: '', category: 'unplanned', reason: '', supersedesId: null });
    setEvidence({ total: '', good: '', reject: '', reference: '' });
  }, [selected]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const data = report.data;
  const activeReasons =
    data?.reasons.filter((r) => !data.reasons.some((next) => next.supersedesId === r.id)) ?? [];
  const local = (instant: string) =>
    new Date(instant).toLocaleString(undefined, {
      timeZone: data?.timezone,
      timeZoneName: 'short',
    });
  const classify = (start: string, end: string, previous?: DowntimeReason) =>
    setReason({
      start,
      end,
      category: previous?.category ?? 'unplanned',
      reason: previous?.reason ?? '',
      supersedesId: previous?.id ?? null,
    });
  return (
    <Box sx={{ p: { xs: 1, md: 3 }, height: '100%', overflow: 'auto' }}>
      <style>{`@page { margin: 12mm; } @media print { main { margin-left:0!important; width:100%!important; padding:0!important } .production-report * { color:#000!important; background:transparent!important } .MuiFab-root, [aria-label="Open AI suggestions"], .MuiSnackbar-root {display:none!important} body, #root, main, main > div { height:auto!important; overflow:visible!important; } .MuiDrawer-root, [data-print-hide] {display:none!important} .production-report {color:#000!important;background:white!important} .production-report .MuiPaper-root {box-shadow:none!important;color:#000!important;background:white!important} table {break-inside:auto} tr {break-inside:avoid} }`}</style>
      <Box data-print-hide>
        <Typography variant="h4">Production shift</Typography>
        {admin && (
          <Button
            onClick={async () => {
              try {
                downloadJson(await productionRequest('/diagnostics'), 'support-diagnostics.json');
              } catch (failure) {
                setError(String(failure));
              }
            }}
          >
            Download support diagnostics
          </Button>
        )}
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Shift workspace" />
          {admin && <Tab label="Commission machine" />}
        </Tabs>
      </Box>
      {tab === 1 && admin ? (
        <Box sx={{ pt: 3 }}>
          <CommissioningPanel />
        </Box>
      ) : (
        <Stack spacing={2} sx={{ pt: 2 }}>
          {(error || report.error || shifts.error || assets.error) && (
            <Alert severity="error">
              {error || String(report.error ?? shifts.error ?? assets.error)}
            </Alert>
          )}
          {admin && health.data && (
            <Alert
              data-print-hide
              severity={
                health.data.storageFailure
                  ? 'error'
                  : health.data.pendingMeasurements > 1000
                    ? 'warning'
                    : 'info'
              }
            >
              Collector backlog: {health.data.pendingMeasurements} measurements.{' '}
              {health.data.storageFailure
                ? `${health.data.storageFailure.message} at ${health.data.storageFailure.at}. Restore storage and restart collection; unreceived time is unknown.`
                : 'Unreceived intervals remain unknown.'}
            </Alert>
          )}
          <Stack direction="row" flexWrap="wrap" gap={2} data-print-hide>
            <TextField
              select
              label="Select shift"
              value={selected}
              sx={{ minWidth: 300 }}
              onChange={(e) => setSelected(e.target.value)}
            >
              <MenuItem value="">Choose a shift</MenuItem>
              {shifts.data?.map((shift) => (
                <MenuItem key={shift.id} value={shift.id}>
                  {shift.name} · {new Date(shift.start).toLocaleString()}
                </MenuItem>
              ))}
            </TextField>
            <Button
              onClick={() => {
                void shifts.refetch();
                void report.refetch();
              }}
            >
              Refresh
            </Button>
          </Stack>
          {admin && (
            <Paper sx={{ p: 2 }} data-print-hide>
              <Typography variant="h6">Plan a shift</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Commission the machine first. Each shift preserves its mapping and cycle standard.
                Include an explicit offset for overnight shifts and daylight-saving changes.
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={2}>
                <TextField
                  select
                  label="Shift machine"
                  value={draft.machineId}
                  onChange={(e) => setDraft((d) => ({ ...d, machineId: e.target.value }))}
                  sx={{ minWidth: 220 }}
                >
                  {assets.data?.map((asset) => (
                    <MenuItem key={asset.id} value={asset.id}>
                      {asset.name}
                    </MenuItem>
                  ))}
                </TextField>
                {(['name', 'timezone', 'start', 'end'] as const).map((key) => (
                  <TextField
                    key={key}
                    label={
                      key === 'name'
                        ? 'Shift name'
                        : key === 'timezone'
                          ? 'Site timezone'
                          : `${key === 'start' ? 'Start' : 'End'} (include UTC offset)`
                    }
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    sx={{ minWidth: 230 }}
                  />
                ))}
                {(['reference', 'product', 'target'] as const).map((key) => (
                  <TextField
                    key={key}
                    label={
                      key === 'reference'
                        ? 'Work order'
                        : key === 'product'
                          ? 'Product'
                          : 'Target quantity (optional)'
                    }
                    value={draft.job[key]}
                    type={key === 'target' ? 'number' : 'text'}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, job: { ...d.job, [key]: e.target.value } }))
                    }
                  />
                ))}
              </Stack>
              {breaks.map((pause, index) => (
                <Stack key={index} direction="row" spacing={1} sx={{ mt: 2 }}>
                  {(['start', 'end'] as const).map((key) => (
                    <TextField
                      key={key}
                      label={`Break ${index + 1} ${key} (UTC offset)`}
                      value={pause[key]}
                      onChange={(e) =>
                        setBreaks((b) =>
                          b.map((item, i) =>
                            i === index ? { ...item, [key]: e.target.value } : item,
                          ),
                        )
                      }
                    />
                  ))}
                  <Button onClick={() => setBreaks((b) => b.filter((_, i) => i !== index))}>
                    Remove break
                  </Button>
                </Stack>
              ))}
              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Button
                  onClick={() => setBreaks((b) => [...b, { start: draft.start, end: draft.end }])}
                >
                  Add planned break
                </Button>
                <Button
                  variant="contained"
                  disabled={
                    busy ||
                    !draft.machineId ||
                    !draft.name ||
                    !draft.job.reference ||
                    !draft.job.product
                  }
                  onClick={() =>
                    void run(async () => {
                      const shift = await productionRequest<Shift>('/shifts', {
                        ...draft,
                        machineId: Number(draft.machineId),
                        breaks,
                        job: {
                          ...draft.job,
                          target: draft.job.target === '' ? null : Number(draft.job.target),
                        },
                      });
                      await shifts.refetch();
                      setSelected(String(shift.id));
                    })
                  }
                >
                  Create shift
                </Button>
              </Stack>
            </Paper>
          )}
          {data && (
            <Stack spacing={2} className="production-report">
              <Typography variant="h5">{data.name}</Typography>
              <Typography>
                {local(data.start)} – {local(data.end)} · {data.timezone}
              </Typography>
              <Typography>
                Work order {data.job.reference} · {data.job.product} · target{' '}
                {number(data.job.target)} · {data.profile.name}
              </Typography>
              <Alert severity={data.verified ? 'success' : 'warning'}>
                {data.verified
                  ? 'Reconciled against recorded independent counts'
                  : 'Incomplete — review the issues below. This report is not verified.'}
              </Alert>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {Object.entries(data.oee).map(([key, value]) => (
                  <Chip key={key} label={`${key}: ${percent(value)}`} />
                ))}
                {Object.entries(data.quantities).map(([key, value]) => (
                  <Chip key={key} label={`${key}: ${number(value)}`} />
                ))}
              </Stack>
              <Typography>
                Scheduled production: {(data.scheduledSeconds / 60).toFixed(1)} min · planned
                exclusions: {(data.plannedSeconds / 60).toFixed(1)} min · observed:{' '}
                {(data.observedSeconds / 60).toFixed(1)} min · unknown:{' '}
                {(data.seconds.unknown / 60).toFixed(1)} min
              </Typography>
              {data.issues.length > 0 && (
                <Box component="ul">
                  {data.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </Box>
              )}
              <Typography variant="h6">Largest losses and data gaps</Typography>
              {data.losses.map((loss) => (
                <Typography key={loss.reason}>
                  {loss.reason}: {(loss.seconds / 60).toFixed(2)} min
                </Typography>
              ))}
              <Typography variant="h6">Machine timeline</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>From</TableCell>
                      <TableCell>Until</TableCell>
                      <TableCell>State</TableCell>
                      <TableCell data-print-hide>Operator action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.intervals.map((interval) => (
                      <TableRow key={interval.start}>
                        <TableCell>{local(interval.start)}</TableCell>
                        <TableCell>{local(interval.end)}</TableCell>
                        <TableCell>{interval.state}</TableCell>
                        <TableCell data-print-hide>
                          {!['running', 'unknown'].includes(interval.state) &&
                            Date.parse(interval.end) <= Date.now() && (
                              <Button onClick={() => classify(interval.start, interval.end)}>
                                Classify stop
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Typography variant="h6">Operator reasons</Typography>
              {activeReasons.map((item) => (
                <Stack direction="row" spacing={1} key={item.id}>
                  <Typography>
                    {local(item.start)} – {local(item.end)}: {item.reason} ({item.category}) · actor{' '}
                    {item.actorId}
                  </Typography>
                  <Button data-print-hide onClick={() => classify(item.start, item.end, item)}>
                    Correct reason
                  </Button>
                </Stack>
              ))}
              <Typography variant="body2">
                {data.reasons.length} preserved reason records, including corrections. Original
                machine observations are unchanged.
              </Typography>
              <Typography variant="h6">Calculation inputs</Typography>
              <Typography variant="body2">
                Revision {data.revision}; ideal cycle {data.profile.idealCycleMs} ms; unknown after{' '}
                {data.profile.maxGapSeconds} s; counter decrease policy {data.profile.counterPolicy}
                . Values above 100% remain visible.
              </Typography>
              {Object.entries(data.profile.signals).map(([role, signal]) => (
                <Typography variant="body2" key={role}>
                  {role}: {signal.nodeKey} · {signal.namespaceUri} / {signal.identifier} · scale{' '}
                  {signal.scale} · unit {signal.unit ?? 'undeclared'}
                </Typography>
              ))}
              {data.evidence && (
                <Typography>
                  Independent evidence: {data.evidence.reference}; total {data.evidence.total}, good{' '}
                  {data.evidence.good}, reject {data.evidence.reject}; recorded by{' '}
                  {data.evidence.actorId}.
                </Typography>
              )}
              <Typography variant="caption">
                Generated {new Date(data.generatedAt).toLocaleString()}. This is application
                evidence, not physical-machine qualification.
              </Typography>
              <Stack direction="row" spacing={2} data-print-hide>
                <Button onClick={() => window.print()}>Print shift report</Button>
                <Button onClick={() => downloadJson(data, `shift-${data.id}.json`)}>
                  Export report and history
                </Button>
              </Stack>
            </Stack>
          )}
          {selected && reason.start && (
            <Paper sx={{ p: 2 }} data-print-hide>
              <Typography variant="h6">
                {reason.supersedesId ? 'Correct recorded reason' : 'Classify observed stop'}
              </Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>
                <TextField
                  label="Stop start (UTC offset)"
                  value={reason.start}
                  onChange={(e) => setReason((r) => ({ ...r, start: e.target.value }))}
                />
                <TextField
                  label="Stop end (UTC offset)"
                  value={reason.end}
                  onChange={(e) => setReason((r) => ({ ...r, end: e.target.value }))}
                />
                <TextField
                  select
                  label="Loss category"
                  value={reason.category}
                  onChange={(e) =>
                    setReason((r) => ({
                      ...r,
                      category: e.target.value as 'planned' | 'unplanned',
                    }))
                  }
                >
                  <MenuItem value="unplanned">Unplanned</MenuItem>
                  <MenuItem value="planned">Planned</MenuItem>
                </TextField>
                <TextField
                  label="Reason / correction explanation"
                  value={reason.reason}
                  onChange={(e) => setReason((r) => ({ ...r, reason: e.target.value }))}
                />
                <Button
                  variant="contained"
                  disabled={busy || !reason.reason.trim()}
                  onClick={() =>
                    void run(async () => {
                      await productionRequest(`/shifts/${selected}/reasons`, reason);
                      await report.refetch();
                      setReason((r) => ({ ...r, start: '', reason: '', supersedesId: null }));
                    })
                  }
                >
                  Save operator reason
                </Button>
              </Stack>
            </Paper>
          )}
          {admin && data && !data.evidence && (
            <Paper sx={{ p: 2 }} data-print-hide>
              <Typography variant="h6">Reconcile independent counts</Typography>
              <Typography variant="body2">
                Record the original shift-sheet or source-system totals and its reference. Evidence
                is preserved once saved; mismatches remain visible.
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 2 }}>
                {(['total', 'good', 'reject', 'reference'] as const).map((key) => (
                  <TextField
                    key={key}
                    label={`Independent ${key}`}
                    type={key === 'reference' ? 'text' : 'number'}
                    value={evidence[key]}
                    onChange={(e) => setEvidence((v) => ({ ...v, [key]: e.target.value }))}
                  />
                ))}
                <Button
                  disabled={busy || Object.values(evidence).some((value) => value === '')}
                  onClick={() =>
                    void run(async () => {
                      await productionRequest(`/shifts/${selected}/reconcile`, {
                        total: Number(evidence.total),
                        good: Number(evidence.good),
                        reject: Number(evidence.reject),
                        reference: evidence.reference,
                      });
                      await report.refetch();
                    })
                  }
                >
                  Record reconciliation
                </Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      )}
    </Box>
  );
}
