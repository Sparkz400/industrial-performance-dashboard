import React, { useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { OperatorEntry, MachineLiveSummary } from '@performance-dashboard/shared';
import { useAuthStore } from '@/stores/useAuthStore';
import { productionRequest } from './CommissioningPanel';

const empty = () => ({
  requestId: crypto.randomUUID(),
  kind: 'note',
  text: '',
  priority: 'normal',
  ownerId: '',
  dueAt: '',
  shiftId: '',
  intervalStart: '',
  intervalEnd: '',
  total: '',
  good: '',
  reject: '',
});
const instant = (value: string) => (value ? new Date(value).toISOString() : null);

/**
 *
 */
export default function OperatorWorkspace() {
  const user = useAuthStore((s) => s.user);
  const editable = user?.role !== 'wallboard' && !user?.recoveryMode;
  const [machine, setMachine] = useState('');
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<OperatorEntry | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const assets = useQuery({
    queryKey: ['production-assets'],
    queryFn: () => productionRequest<{ id: number; name: string }[]>('/assets'),
  });
  const owners = useQuery({
    queryKey: ['operator-owners'],
    queryFn: () => productionRequest<{ id: number; username: string }[]>('/operator/owners'),
  });
  const shifts = useQuery({
    queryKey: ['production-shifts'],
    queryFn: () => productionRequest<{ id: number; name: string; machineId: number }[]>('/shifts'),
  });
  const entries = useQuery({
    queryKey: ['operator-entries', machine, all],
    queryFn: () =>
      productionRequest<{ entries: OperatorEntry[]; truncated: boolean }>(
        `/operator/entries?machineId=${machine}&status=${all ? 'all' : 'open'}`,
      ),
    enabled: !!machine,
    refetchInterval: 10000,
  });
  const live = useQuery({
    queryKey: ['operator-current', machine],
    queryFn: () =>
      productionRequest<{ machines: MachineLiveSummary[] }>(`/operator/live?ids=${machine}`),
    enabled: !!machine,
    refetchInterval: 5000,
  });
  const events = useQuery({
    queryKey: ['operator-history', history],
    queryFn: () =>
      productionRequest<{
        events: {
          id: number;
          actorId: number;
          version: number;
          createdAt: string;
          snapshot: OperatorEntry;
        }[];
        truncated: boolean;
      }>(`/operator/entries/${history}/history`),
    enabled: history !== null,
  });
  const actor = (id: number | null) =>
    id === null
      ? 'Unassigned'
      : (owners.data?.find((owner) => owner.id === id)?.username ?? `User #${id}`);
  const clear = () => {
    setDraft(empty());
    setEditing(null);
    setError('');
  };
  const edit = (entry: OperatorEntry) => {
    setEditing(entry);
    setError('');
    setDraft({
      ...empty(),
      kind: entry.kind,
      text: entry.text,
      priority: entry.priority,
      ownerId: entry.ownerId?.toString() ?? '',
      dueAt: entry.dueAt ?? '',
      shiftId: entry.shiftId?.toString() ?? '',
    });
  };
  const save = async (status: 'open' | 'resolved') => {
    setBusy(true);
    setError('');
    try {
      const mutable = {
        text: draft.text,
        priority: draft.priority,
        ownerId: draft.ownerId ? Number(draft.ownerId) : null,
        dueAt: instant(draft.dueAt),
      };
      await productionRequest(
        editing ? `/operator/entries/${editing.id}` : '/operator/entries',
        editing
          ? { ...mutable, version: editing.version, status }
          : {
              ...mutable,
              requestId: draft.requestId,
              machineId: Number(machine),
              shiftId: draft.shiftId ? Number(draft.shiftId) : null,
              kind: draft.kind,
              intervalStart: instant(draft.intervalStart),
              intervalEnd: instant(draft.intervalEnd),
              quantity:
                draft.kind === 'quantity'
                  ? {
                      total: Number(draft.total),
                      good: Number(draft.good),
                      reject: Number(draft.reject),
                    }
                  : null,
            },
      );
      clear();
      await entries.refetch();
      if (history !== null) await events.refetch();
    } catch (failure) {
      setError(String(failure));
      await entries.refetch();
    } finally {
      setBusy(false);
    }
  };
  const quantityReady =
    draft.kind !== 'quantity' ||
    [draft.total, draft.good, draft.reject, draft.shiftId].every(Boolean);
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Operator handover</Typography>
      <Typography color="text.secondary">
        Record observations, assign follow-up actions and review the next shift’s outstanding work.
        Manual counts stay separate from measured production.
      </Typography>
      <TextField
        select
        label="Handover machine"
        value={machine}
        onChange={(e) => {
          setMachine(e.target.value);
          clear();
          setHistory(null);
        }}
      >
        {assets.data?.map((asset) => (
          <MenuItem key={asset.id} value={asset.id}>
            {asset.name}
          </MenuItem>
        ))}
      </TextField>
      {(error || assets.error || entries.error || owners.error || shifts.error || events.error) && (
        <Alert severity="error">
          {error ||
            String(assets.error ?? entries.error ?? owners.error ?? shifts.error ?? events.error)}
        </Alert>
      )}
      {machine && (
        <>
          {live.error ? (
            <Alert severity="warning">Current work-order status unavailable.</Alert>
          ) : (
            live.data?.machines.map((asset) => (
              <Paper key={asset.id} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6">
                  {asset.shift?.job.reference || 'No active work order'} {asset.shift?.job.product}
                </Typography>
                <Typography>
                  {asset.shift?.name} · {asset.state} · {asset.freshness}
                </Typography>
                <Typography>
                  Observed {asset.production.observed?.toLocaleString() ?? 'unknown'} /{' '}
                  {asset.shift?.job.target?.toLocaleString() ?? '—'} target
                  {asset.production.complete ? '' : ' · partial or unavailable coverage'}
                </Typography>
              </Paper>
            ))
          )}
          <Button onClick={() => setAll(!all)}>
            {all ? 'Show outstanding only' : 'Include resolved entries'}
          </Button>
          {entries.data?.truncated && (
            <Alert severity="warning">
              Showing the latest 200 matching entries. Older entries remain stored.
            </Alert>
          )}
          {entries.data?.entries.length === 0 && (
            <Typography>No matching handover entries.</Typography>
          )}
          {entries.data?.entries.map((entry) => (
            <Paper
              key={entry.id}
              variant="outlined"
              sx={{
                p: 2,
                borderLeft: 4,
                borderLeftColor: entry.priority === 'high' ? 'warning.main' : 'divider',
              }}
            >
              <Typography fontWeight={700}>
                {entry.kind} · {entry.priority} priority · {entry.status}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {entry.text}
              </Typography>
              <Typography variant="body2">
                Owner: {actor(entry.ownerId)}
                {entry.dueAt ? ` · Due ${new Date(entry.dueAt).toLocaleString()}` : ''}
              </Typography>
              <Typography variant="body2">
                Recorded by {actor(entry.createdBy)} · {new Date(entry.createdAt).toLocaleString()}{' '}
                · revision {entry.version}
                {entry.shiftId ? ` · shift #${entry.shiftId}` : ''}
              </Typography>
              {entry.intervalStart && (
                <Typography variant="body2">
                  Observation: {new Date(entry.intervalStart).toLocaleString()} –{' '}
                  {new Date(entry.intervalEnd!).toLocaleString()}
                </Typography>
              )}
              {entry.quantity && (
                <Alert severity="info">
                  Manual declaration: {entry.quantity.total} total, {entry.quantity.good} good,{' '}
                  {entry.quantity.reject} reject.{' '}
                  {entry.status === 'resolved' ? 'Reviewed; ' : 'Awaiting administrator review; '}
                  measured KPIs are unchanged.
                </Alert>
              )}
              <Button onClick={() => setHistory(history === entry.id ? null : entry.id)}>
                History #{entry.id}
              </Button>
              {editable && (entry.kind !== 'quantity' || user?.role === 'admin') && (
                <Button onClick={() => edit(entry)}>Review / edit #{entry.id}</Button>
              )}
              {history === entry.id && (
                <Stack spacing={1} aria-label={`History for entry ${entry.id}`}>
                  {events.data?.truncated && <Typography>Latest 100 revisions shown.</Typography>}
                  {events.data?.events.map((event) => (
                    <Typography key={event.id} variant="body2">
                      Revision {event.version} · {actor(event.actorId)} ·{' '}
                      {new Date(event.createdAt).toLocaleString()} · {event.snapshot.status} ·{' '}
                      {event.snapshot.text} · owner {actor(event.snapshot.ownerId)} ·{' '}
                      {event.snapshot.priority} priority
                      {event.snapshot.dueAt
                        ? ` · due ${new Date(event.snapshot.dueAt).toLocaleString()}`
                        : ''}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Paper>
          ))}
          {editable && (
            <Paper
              component="form"
              variant="outlined"
              sx={{ p: 2 }}
              onSubmit={(e) => {
                e.preventDefault();
                void save(editing?.status ?? 'open');
              }}
            >
              <Stack spacing={2}>
                <Typography variant="h6">
                  {editing
                    ? `Review entry #${editing.id} · revision ${editing.version}`
                    : 'New handover entry'}
                </Typography>
                <TextField
                  select
                  label="Entry type"
                  value={draft.kind}
                  disabled={!!editing}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                >
                  <MenuItem value="note">Handover note</MenuItem>
                  <MenuItem value="action">Assigned action</MenuItem>
                  <MenuItem value="quantity">Manual quantity declaration</MenuItem>
                </TextField>
                <TextField
                  required
                  multiline
                  minRows={2}
                  label="Observation / action"
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  slotProps={{ htmlInput: { maxLength: 4000 } }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    select
                    label="Priority"
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                  >
                    <MenuItem value="normal">Normal</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </TextField>
                  <TextField
                    fullWidth
                    select
                    label="Action owner"
                    value={draft.ownerId}
                    required={draft.kind === 'action'}
                    onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
                  >
                    <MenuItem value="">Unassigned</MenuItem>
                    {owners.data?.map((owner) => (
                      <MenuItem key={owner.id} value={owner.id}>
                        {owner.username}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <TextField
                  label="Due date (ISO with timezone, optional)"
                  placeholder="2026-10-26T18:00:00+01:00"
                  value={draft.dueAt}
                  onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
                />
                {!editing && (
                  <>
                    <TextField
                      select
                      label="Linked shift"
                      value={draft.shiftId}
                      required={draft.kind === 'quantity'}
                      onChange={(e) => setDraft({ ...draft, shiftId: e.target.value })}
                    >
                      <MenuItem value="">No shift</MenuItem>
                      {shifts.data
                        ?.filter((shift) => shift.machineId === Number(machine))
                        .map((shift) => (
                          <MenuItem key={shift.id} value={shift.id}>
                            {shift.name}
                          </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                      label="Observation start (ISO with timezone, optional)"
                      value={draft.intervalStart}
                      onChange={(e) => setDraft({ ...draft, intervalStart: e.target.value })}
                    />
                    <TextField
                      label="Observation end (ISO with timezone, optional)"
                      value={draft.intervalEnd}
                      onChange={(e) => setDraft({ ...draft, intervalEnd: e.target.value })}
                    />
                    {draft.kind === 'quantity' && (
                      <>
                        <Alert severity="info">
                          Declare independent counts for review. This does not replace measurements
                          or verify the shift report.
                        </Alert>
                        <TextField
                          required
                          type="number"
                          label="Declared total"
                          value={draft.total}
                          onChange={(e) => setDraft({ ...draft, total: e.target.value })}
                        />
                        <TextField
                          required
                          type="number"
                          label="Declared good"
                          value={draft.good}
                          onChange={(e) => setDraft({ ...draft, good: e.target.value })}
                        />
                        <TextField
                          required
                          type="number"
                          label="Declared reject"
                          value={draft.reject}
                          onChange={(e) => setDraft({ ...draft, reject: e.target.value })}
                        />
                      </>
                    )}
                  </>
                )}
                <Stack direction="row" spacing={1}>
                  <Button type="submit" variant="contained" disabled={busy || !quantityReady}>
                    Save handover
                  </Button>
                  {editing && (
                    <Button
                      disabled={busy}
                      onClick={() => void save(editing.status === 'open' ? 'resolved' : 'open')}
                    >
                      {editing.status === 'open' ? 'Resolve / mark reviewed' : 'Reopen entry'}
                    </Button>
                  )}
                  <Button disabled={busy} onClick={clear}>
                    New entry / cancel edit
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
