import { formatDateTime, formatNumber, formatPercent, translate as t, useLanguage } from '@/i18n';
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
import OperatorWorkspace from './OperatorWorkspace';
import ShiftInspectionsPanel from './ShiftInspectionsPanel';
import MqttSourcesPanel from './MqttSourcesPanel';
import IncidentReplayPanel from './IncidentReplayPanel';
import { Link, useSearchParams } from 'react-router-dom';

interface Shift {
  id: number;
  name: string;
  machineId: number;
  start: string;
  end: string;
}
const iso = (time: number) => new Date(time).toISOString();
const percent = (value: number | null) => formatPercent(value);
const number = (value: number | null) => formatNumber(value);

/**
 *
 */
export default function ProductionPage() {
  useLanguage((s) => s.language);
  const role = useAuthStore((s) => s.user?.role);
  const admin = role === 'admin';
  const supervisor = admin || role === 'supervisor';
  const operator = supervisor || role === 'operator';
  // Links from service records open a shift (?shift=) or a prefilled replay (?replay=1).
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('replay') ? 3 : 0);
  const [selected, setSelected] = useState(params.get('shift') ?? '');
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
    category: DowntimeReason['category'];
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
        capacityMeasurements: number;
        spoolBytes: number | null;
        oldestReceivedAgeSeconds: number | null;
        committedLastMinute: number;
        quarantinedMeasurements: number;
        writeFailure: { at: string; message: string } | null;
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
    new Date(instant).toLocaleString(useLanguage.getState().language, {
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
      <style>{`@page { margin: 12mm; } @media print { main { margin-left:0!important; width:100%!important; padding:0!important } .production-report * { color:#000!important; background:transparent!important } .MuiFab-root, .MuiSnackbar-root {display:none!important} body, #root, main, main > div { height:auto!important; overflow:visible!important; } .MuiDrawer-root, [data-print-hide] {display:none!important} .production-report {color:#000!important;background:white!important} .production-report .MuiPaper-root {box-shadow:none!important;color:#000!important;background:white!important} table {break-inside:auto} tr {break-inside:avoid} }`}</style>
      <Box data-print-hide>
        <Typography variant="h4">{t('Production shift')} </Typography>
        <Button component={Link} to="/wallboard">
          {t('Open supervisor wallboard')}{' '}
        </Button>
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
            {t('Download support diagnostics')}{' '}
          </Button>
        )}
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          <Tab value={0} label={t('Shift workspace')} />
          <Tab value={2} label={t('Operator handover')} />
          <Tab value={3} label={t('Incident replay')} />
          {admin && <Tab value={1} label={t('Commission machine')} />}
        </Tabs>
      </Box>
      {tab === 3 ? (
        <IncidentReplayPanel />
      ) : tab === 2 ? (
        <Box sx={{ pt: 3 }}>
          <OperatorWorkspace />
        </Box>
      ) : tab === 1 && admin ? (
        <Stack spacing={3} sx={{ pt: 3 }}>
          <CommissioningPanel />
          <MqttSourcesPanel machines={assets.data ?? []} />
        </Stack>
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
                  : health.data.writeFailure || health.data.pendingMeasurements > 1000
                    ? 'warning'
                    : 'info'
              }
            >
              {t('Collector backlog:')} {health.data.pendingMeasurements} /{' '}
              {health.data.capacityMeasurements} {t('measurements.')}{' '}
              {health.data.spoolBytes != null &&
                `${(health.data.spoolBytes / 1048576).toFixed(1)} MiB · `}
              {t('Oldest:')}{' '}
              {health.data.oldestReceivedAgeSeconds == null
                ? '—'
                : `${Math.round(health.data.oldestReceivedAgeSeconds)} s`}{' '}
              · {t('Written last minute:')} {health.data.committedLastMinute}.{' '}
              {health.data.writeFailure &&
                `${t('Last database write failed:')} ${health.data.writeFailure.message} (${health.data.writeFailure.at}). `}
              {health.data.quarantinedMeasurements > 0 && (
                <>
                  {t('Quarantined (refused by the database):')}{' '}
                  {health.data.quarantinedMeasurements}.{' '}
                  <Button
                    size="small"
                    onClick={() =>
                      run(async () =>
                        downloadJson(
                          await productionRequest('/quarantine'),
                          'quarantined-measurements.json',
                        ),
                      )
                    }
                  >
                    {t('Export quarantined')}
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      run(async () => {
                        await productionRequest('/quarantine/requeue', {});
                        await health.refetch();
                      })
                    }
                  >
                    {t('Retry quarantined')}
                  </Button>{' '}
                </>
              )}
              {health.data.storageFailure
                ? `${health.data.storageFailure.message} at ${health.data.storageFailure.at}. Restore storage and restart collection; unreceived time is unknown.`
                : t('Unreceived intervals remain unknown.')}
            </Alert>
          )}
          <Stack
            direction="row"
            data-print-hide
            sx={{
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <TextField
              select
              label={t('Select shift')}
              value={selected}
              sx={{ minWidth: 300 }}
              onChange={(e) => setSelected(e.target.value)}
            >
              <MenuItem value="">{t('Choose a shift')} </MenuItem>
              {shifts.data?.map((shift) => (
                <MenuItem key={shift.id} value={shift.id}>
                  {shift.name} ·{' '}
                  {new Date(shift.start).toLocaleString(useLanguage.getState().language)}
                </MenuItem>
              ))}
            </TextField>
            <Button
              onClick={() => {
                void shifts.refetch();
                void report.refetch();
              }}
            >
              {t('Refresh')}{' '}
            </Button>
          </Stack>
          {admin && (
            <Paper sx={{ p: 2 }} data-print-hide>
              <Typography variant="h6">{t('Plan a shift')} </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {t(
                  'Commission the machine first. Each shift preserves its mapping and cycle standard. Include an explicit offset for overnight shifts and daylight-saving changes.',
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
                  label={t('Shift machine')}
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
                    {t('Remove break')}{' '}
                  </Button>
                </Stack>
              ))}
              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Button
                  onClick={() => setBreaks((b) => [...b, { start: draft.start, end: draft.end }])}
                >
                  {t('Add planned break')}{' '}
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
                  {t('Create shift')}{' '}
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
                {t('Work order')} {data.job.reference} · {data.job.product} {t('· target')}{' '}
                {number(data.job.target)} · {data.profile.name}
              </Typography>
              <Alert severity={data.verified ? 'success' : 'warning'}>
                {data.verified
                  ? t('Reconciled against recorded independent counts')
                  : t('Incomplete — review the issues below. This report is not verified.')}
              </Alert>
              <Stack
                direction="row"
                sx={{
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                {Object.entries(data.oee).map(([key, value]) => (
                  <Chip key={key} label={`${key}: ${percent(value)}`} />
                ))}
                {Object.entries(data.quantities).map(([key, value]) => (
                  <Chip key={key} label={`${key}: ${number(value)}`} />
                ))}
                {data.quantitySource === 'declaration' && (
                  <Chip color="warning" label={t('Quantities: reviewed manual declaration')} />
                )}
                {(data.stateSource === 'manual' || data.stateSource === 'mixed') && (
                  <Chip
                    color="warning"
                    label={`${t('State: reviewed manual declarations')} · ${((data.manualStateSeconds ?? 0) / 60).toFixed(1)} ${t('min')}`}
                  />
                )}
              </Stack>
              <Typography>
                {t('Scheduled production:')} {(data.scheduledSeconds / 60).toFixed(1)}{' '}
                {t('min · planned exclusions:')} {(data.plannedSeconds / 60).toFixed(1)}{' '}
                {t('min · observed:')} {(data.observedSeconds / 60).toFixed(1)}{' '}
                {t('min · unknown:')} {(data.seconds.unknown / 60).toFixed(1)} {t('min')}{' '}
              </Typography>
              {data.issues.length > 0 && (
                <Box component="ul">
                  {data.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </Box>
              )}
              <Typography variant="h6">{t('Largest losses and data gaps')} </Typography>
              {data.losses.map((loss) => (
                <Typography key={loss.reason}>
                  {loss.reason}: {(loss.seconds / 60).toFixed(2)} {t('min')}{' '}
                </Typography>
              ))}
              <Typography variant="h6">{t('Open handover items')}</Typography>
              {data.handover?.length ? (
                <Box component="ul">
                  {data.handover.map((item) => (
                    <li key={item.id}>
                      #{item.id} · {item.priority === 'high' ? `${t('High priority')} · ` : ''}
                      {item.text} · {t('Owner')}:{' '}
                      {item.ownerName ?? (item.ownerId ? `#${item.ownerId}` : t('Unassigned'))}
                      {item.dueAt ? ` · ${t('Due')} ${formatDateTime(item.dueAt)}` : ''}
                    </li>
                  ))}
                </Box>
              ) : (
                <Typography>{t('No open handover items for this shift.')}</Typography>
              )}
              <Typography variant="h6">{t('Machine timeline')} </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('From')} </TableCell>
                      <TableCell>{t('Until')} </TableCell>
                      <TableCell>{t('State')} </TableCell>
                      <TableCell data-print-hide>{t('Operator action')} </TableCell>
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
                            operator &&
                            Date.parse(interval.end) <= Date.now() && (
                              <Button onClick={() => classify(interval.start, interval.end)}>
                                {t('Classify stop')}{' '}
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Typography variant="h6">{t('Operator reasons')} </Typography>
              {activeReasons.map((item) => (
                <Stack direction="row" spacing={1} key={item.id}>
                  <Typography>
                    {local(item.start)} – {local(item.end)}: {item.reason} ({item.category}
                    {t(') · actor')} {item.actorId}
                  </Typography>
                  <Button
                    disabled={!operator}
                    data-print-hide
                    onClick={() => classify(item.start, item.end, item)}
                  >
                    {t('Correct reason')}{' '}
                  </Button>
                </Stack>
              ))}
              <Typography variant="body2">
                {data.reasons.length}{' '}
                {t(
                  'preserved reason records, including corrections. Original machine observations are unchanged.',
                )}{' '}
              </Typography>
              <Typography variant="h6">{t('Calculation inputs')} </Typography>
              <Typography variant="body2">
                {t('Revision')} {data.revision}
                {t('; ideal cycle')} {data.profile.idealCycleMs} {t('ms; unknown after')}{' '}
                {data.profile.maxGapSeconds} {t('s; counter decrease policy')}{' '}
                {data.profile.counterPolicy}
                {t('. Values above 100% remain visible.')}{' '}
              </Typography>
              {Object.entries(data.profile.signals).map(([role, signal]) => (
                <Typography variant="body2" key={role}>
                  {role}: {signal.nodeKey} · {signal.namespaceUri} / {signal.identifier}{' '}
                  {t('· scale')} {signal.scale} {t('· unit')} {signal.unit ?? 'undeclared'}
                </Typography>
              ))}
              {data.evidence && (
                <Typography>
                  {t('Independent evidence:')} {data.evidence.reference}
                  {t('; total')} {data.evidence.total}
                  {t(', good')} {data.evidence.good}
                  {t(', reject')} {data.evidence.reject}
                  {t('; recorded by')} {data.evidence.actorId}.
                </Typography>
              )}
              <Typography variant="caption">
                {t('Generated')}{' '}
                {new Date(data.generatedAt).toLocaleString(useLanguage.getState().language)}
                {t('. This is application evidence, not physical-machine qualification.')}{' '}
              </Typography>
              <Stack direction="row" spacing={2} data-print-hide>
                <Button onClick={() => window.print()}>{t('Print shift report')} </Button>
                <Button onClick={() => downloadJson(data, `shift-${data.id}.json`)}>
                  {t('Export report and history')}{' '}
                </Button>
              </Stack>
            </Stack>
          )}
          {operator && selected && reason.start && (
            <Paper sx={{ p: 2 }} data-print-hide>
              <Typography variant="h6">
                {reason.supersedesId ? t('Correct recorded reason') : t('Classify observed stop')}
              </Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>
                <TextField
                  label={t('Stop start (UTC offset)')}
                  value={reason.start}
                  onChange={(e) => setReason((r) => ({ ...r, start: e.target.value }))}
                />
                <TextField
                  label={t('Stop end (UTC offset)')}
                  value={reason.end}
                  onChange={(e) => setReason((r) => ({ ...r, end: e.target.value }))}
                />
                <TextField
                  select
                  label={t('Loss category')}
                  value={reason.category}
                  onChange={(e) =>
                    setReason((r) => ({
                      ...r,
                      category: e.target.value as 'planned' | 'unplanned',
                    }))
                  }
                >
                  <MenuItem value="unplanned">{t('Unplanned')} </MenuItem>
                  <MenuItem value="changeover">{t('Changeover')} </MenuItem>
                  <MenuItem value="planned">{t('Planned')} </MenuItem>
                </TextField>
                <TextField
                  label={t('Reason / correction explanation')}
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
                  {t('Save operator reason')}{' '}
                </Button>
              </Stack>
            </Paper>
          )}
          {selected && data && (
            <ShiftInspectionsPanel
              key={selected}
              shiftId={selected}
              machineId={data.machineId}
              canRecord={operator}
              canPlan={supervisor}
            />
          )}
          {supervisor && data && !data.evidence && (
            <Paper sx={{ p: 2 }} data-print-hide>
              <Typography variant="h6">{t('Reconcile independent counts')} </Typography>
              <Typography variant="body2">
                {t(
                  'Record the original shift-sheet or source-system totals and its reference. Evidence is preserved once saved; mismatches remain visible.',
                )}{' '}
              </Typography>
              <Stack
                direction="row"
                sx={{
                  flexWrap: 'wrap',
                  gap: 2,
                  mt: 2,
                }}
              >
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
                  {t('Record reconciliation')}{' '}
                </Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      )}
    </Box>
  );
}
