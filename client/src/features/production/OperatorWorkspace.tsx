import { translate as t, useLanguage } from '@/i18n';
import LiveState from './LiveState';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { OperatorEntry, MachineLiveSummary } from '@performance-dashboard/shared';
import { useAuthStore } from '@/stores/useAuthStore';
import { productionRequest } from './CommissioningPanel';
import {
  OFFLINE_DRAFT_EVENT,
  OFFLINE_DRAFT_KEY,
  OFFLINE_DRAFT_TTL,
  readOfflineDrafts,
  retainOfflineDraft,
  discardOfflineDraft,
  type OfflineEntryBase,
  type OfflineOperatorDraft,
  type OperatorDraftForm,
} from './offlineDrafts';

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
  manualState: '',
});
const reviewedKinds = ['quantity', 'state'];
const instant = (value: string) => (value ? new Date(value).toISOString() : null);

/**
 *
 */
export default function OperatorWorkspace() {
  useLanguage((s) => s.language);
  const user = useAuthStore((s) => s.user);
  const editable =
    ['admin', 'operator', 'supervisor'].includes(user?.role ?? '') && !user?.recoveryMode;
  const [machine, setMachine] = useState('');
  const [draft, setDraft] = useState<OperatorDraftForm>(empty);
  const [editing, setEditing] = useState<OfflineEntryBase | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [retained, setRetained] = useState<OfflineOperatorDraft[]>([]);
  const [offlineReview, setOfflineReview] = useState<OfflineOperatorDraft | null>(null);
  const [reviewReady, setReviewReady] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<OperatorEntry | null>(null);
  const reviewing = useRef<string | null>(null);
  const identityGeneration = useRef(0);
  useEffect(() => {
    identityGeneration.current++;
    setDraft(empty());
    setMachine('');
    setEditing(null);
    setHistory(null);
    setError('');
    setOfflineReview(null);
    setCurrentEntry(null);
    setReviewed(false);
    setReviewReady(false);
    reviewing.current = null;
  }, [user?.id, user?.role]);
  useEffect(() => {
    const reload = () => setRetained(user ? readOfflineDrafts(user.id) : []);
    const connection = () => {
      setOnline(navigator.onLine);
      setReviewed(false);
      setReviewReady(false);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === OFFLINE_DRAFT_KEY || event.key === null) {
        let sameOwner = false;
        try {
          sameOwner = JSON.parse(event.newValue ?? 'null')?.userId === user?.id;
        } catch {
          /* Invalid storage must not expose an open protected copy. */
        }
        const remaining = user && sameOwner ? readOfflineDrafts(user.id) : [];
        setRetained(remaining);
        if (
          sameOwner &&
          (!reviewing.current || remaining.some((item) => item.id === reviewing.current))
        )
          return;
        // Another tab can log out while this tab is offline: erase its open copy too.
        identityGeneration.current++;
        reviewing.current = null;
        setDraft(empty());
        setEditing(null);
        setHistory(null);
        setError('');
        setOfflineReview(null);
        setCurrentEntry(null);
        setReviewed(false);
        setReviewReady(false);
        if (!sameOwner) useAuthStore.getState().clearLocalSession();
      }
    };
    reload();
    window.addEventListener(OFFLINE_DRAFT_EVENT, reload);
    window.addEventListener('storage', storage);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    const expiry = window.setInterval(reload, 30000);
    return () => {
      window.removeEventListener(OFFLINE_DRAFT_EVENT, reload);
      window.removeEventListener('storage', storage);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.clearInterval(expiry);
    };
  }, [user]);
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
    setOfflineReview(null);
    reviewing.current = null;
    setReviewed(false);
    setReviewReady(false);
    setCurrentEntry(null);
  };
  const edit = (entry: OperatorEntry) => {
    clear();
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
    if (!online || (offlineReview && (!reviewReady || !reviewed))) return;
    const generation = identityGeneration.current;
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
          ? {
              ...mutable,
              version: editing.version,
              status,
              ...(offlineReview
                ? { offlineIntentId: offlineReview.id, offlineDraftedAt: offlineReview.createdAt }
                : {}),
            }
          : {
              ...mutable,
              requestId: draft.requestId,
              ...(offlineReview ? { offlineDraftedAt: offlineReview.createdAt } : {}),
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
              ...(draft.kind === 'state' ? { manualState: draft.manualState } : {}),
            },
      );
      if (identityGeneration.current !== generation) return;
      if (offlineReview && user && useAuthStore.getState().user?.id === user.id)
        discardOfflineDraft(user.id, offlineReview.id);
      clear();
      await entries.refetch();
      if (history !== null) await events.refetch();
    } catch (failure) {
      if (identityGeneration.current !== generation) return;
      setError(String(failure));
      await entries.refetch();
    } finally {
      setBusy(false);
    }
  };
  const keepDraft = () => {
    if (!user || !machine) return;
    try {
      const created = Date.now();
      retainOfflineDraft({
        id: editing ? crypto.randomUUID() : draft.requestId,
        userId: user.id,
        machineId: Number(machine),
        createdAt: new Date(created).toISOString(),
        expiresAt: new Date(created + OFFLINE_DRAFT_TTL).toISOString(),
        form: { ...draft },
        entry: editing
          ? { id: editing.id, version: editing.version, kind: editing.kind, status: editing.status }
          : null,
        status: editing?.status ?? 'open',
      });
      clear();
    } catch (failure) {
      setError(String(failure));
    }
  };
  const reviewDraft = async (item: OfflineOperatorDraft) => {
    if (!user || item.userId !== user.id) return;
    const generation = identityGeneration.current;
    clear();
    setMachine(String(item.machineId));
    setDraft({ ...item.form });
    setEditing(item.entry);
    setOfflineReview(item);
    reviewing.current = item.id;
    if (!navigator.onLine) return;
    try {
      const latest = await productionRequest<{ entries: OperatorEntry[] }>(
        `/operator/entries?machineId=${item.machineId}&status=all`,
      );
      let current = item.entry ? latest.entries.find((entry) => entry.id === item.entry!.id) : null;
      if (item.entry && !current) {
        const historyResult = await productionRequest<{ events: { snapshot: OperatorEntry }[] }>(
          `/operator/entries/${item.entry.id}/history`,
        );
        current = historyResult.events[0]?.snapshot;
      }
      if (
        identityGeneration.current !== generation ||
        useAuthStore.getState().user?.id !== user.id ||
        reviewing.current !== item.id
      )
        return;
      setCurrentEntry(current ?? null);
      setReviewReady(true);
    } catch (failure) {
      if (
        identityGeneration.current === generation &&
        useAuthStore.getState().user?.id === user.id &&
        reviewing.current === item.id
      )
        setError(String(failure));
    }
  };
  const quantityReady =
    (draft.kind !== 'quantity' ||
      [draft.total, draft.good, draft.reject, draft.shiftId].every(Boolean)) &&
    (draft.kind !== 'state' ||
      [draft.manualState, draft.shiftId, draft.intervalStart, draft.intervalEnd].every(Boolean));
  return (
    <Stack spacing={2}>
      <Typography variant="h5">{t('Operator handover')} </Typography>
      <Typography color="text.secondary">
        {t(
          'Record observations, assign follow-up actions and review the next shift’s outstanding work. Manual counts stay separate from measured production.',
        )}{' '}
      </Typography>
      {(!online || entries.isError || live.isError) && (
        <Alert severity="warning">
          {t(
            'Connection unavailable: displayed data is cached and may be stale. Drafts are not sent automatically.',
            'Verbindung nicht verfügbar: Angezeigte Daten sind zwischengespeichert und möglicherweise veraltet. Entwürfe werden nicht automatisch gesendet.',
          )}
        </Alert>
      )}
      {editable && retained.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography variant="h6">
              {t('Drafts on this device', 'Entwürfe auf diesem Gerät')}
            </Typography>
            {retained.map((item) => (
              <Stack
                key={item.id}
                spacing={1}
                sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}
              >
                <Typography sx={{ overflowWrap: 'anywhere' }}>
                  {assets.data?.find((asset) => asset.id === item.machineId)?.name ??
                    `#${item.machineId}`}{' '}
                  · {item.form.text}
                </Typography>
                <Typography variant="body2">
                  {t('Retained locally · expires', 'Lokal gespeichert · läuft ab')}{' '}
                  {new Date(item.expiresAt).toLocaleString(useLanguage.getState().language)}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  <Button onClick={() => void reviewDraft(item)}>
                    {t('Review retained draft', 'Gespeicherten Entwurf prüfen')}
                  </Button>
                  <Button
                    onClick={() => {
                      if (user) discardOfflineDraft(user.id, item.id);
                      if (offlineReview?.id === item.id) clear();
                    }}
                  >
                    {t('Discard draft', 'Entwurf verwerfen')}
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
      <TextField
        select
        label={t('Handover machine')}
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
            <Alert severity="warning">{t('Current work-order status unavailable.')} </Alert>
          ) : (
            live.data?.machines.map((asset) => (
              <Paper key={asset.id} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6">
                  {asset.shift?.job.reference ||
                    t('No active work order', 'Kein aktiver Arbeitsauftrag')}{' '}
                  {asset.shift?.job.product}
                </Typography>
                <Typography>{asset.shift?.name}</Typography>
                <LiveState
                  machine={asset}
                  updatedAt={live.dataUpdatedAt}
                  failed={!online || !!live.error}
                />
                {!online && (
                  <Typography variant="body2">
                    {t('Cached observation from', 'Zwischengespeicherte Beobachtung vom')}{' '}
                    {new Date(live.dataUpdatedAt).toLocaleString(useLanguage.getState().language)}
                  </Typography>
                )}
                <Typography>
                  {t('Observed')}{' '}
                  {asset.production.observed?.toLocaleString(useLanguage.getState().language) ??
                    t('Unknown')}{' '}
                  /{' '}
                  {asset.shift?.job.target?.toLocaleString(useLanguage.getState().language) ?? '—'}{' '}
                  {t('target')}{' '}
                  {asset.production.complete ? '' : t(' · partial or unavailable coverage')}
                </Typography>
              </Paper>
            ))
          )}
          <Button onClick={() => setAll(!all)}>
            {all ? t('Show outstanding only') : t('Include resolved entries')}
          </Button>
          {entries.data?.truncated && (
            <Alert severity="warning">
              {t('Showing the latest 200 matching entries. Older entries remain stored.')}{' '}
            </Alert>
          )}
          {entries.data?.entries.length === 0 && (
            <Typography>{t('No matching handover entries.')} </Typography>
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
                {entry.kind} · {entry.priority} {t('priority ·')} {entry.status}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {entry.text}
              </Typography>
              <Typography variant="body2">
                {t('Owner:')} {actor(entry.ownerId)}
                {entry.dueAt
                  ? ` · Due ${new Date(entry.dueAt).toLocaleString(useLanguage.getState().language)}`
                  : ''}
              </Typography>
              <Typography variant="body2">
                {t('Recorded by')} {actor(entry.createdBy)} ·{' '}
                {new Date(entry.createdAt).toLocaleString(useLanguage.getState().language)}{' '}
                {t('· revision')} {entry.version}
                {entry.shiftId ? ` · shift #${entry.shiftId}` : ''}
              </Typography>
              {entry.intervalStart && (
                <Typography variant="body2">
                  {t('Observation:')}{' '}
                  {new Date(entry.intervalStart).toLocaleString(useLanguage.getState().language)} –{' '}
                  {new Date(entry.intervalEnd!).toLocaleString(useLanguage.getState().language)}
                </Typography>
              )}
              {entry.quantity && (
                <Alert severity="info">
                  {t('Manual declaration:')} {entry.quantity.total} {t('total,')}{' '}
                  {entry.quantity.good} {t('good,')} {entry.quantity.reject} {t('reject.')}{' '}
                  {entry.status === 'resolved'
                    ? t(
                        'Reviewed; the shift report uses it only where machine counters are incomplete and stays unverified.',
                      )
                    : t('Awaiting review; not used in the shift report.')}{' '}
                </Alert>
              )}
              {entry.manualState && (
                <Alert severity="info">
                  {t('Manual state declaration:')} {entry.manualState}.{' '}
                  {entry.status === 'resolved'
                    ? t(
                        'Reviewed; the shift report uses it only where the machine state is unknown and stays unverified.',
                      )
                    : t('Awaiting review; not used in the shift report.')}
                </Alert>
              )}
              <Button onClick={() => setHistory(history === entry.id ? null : entry.id)}>
                {t('History #')}
                {entry.id}
              </Button>
              {editable &&
                (!reviewedKinds.includes(entry.kind) ||
                  ['admin', 'supervisor'].includes(user?.role ?? '')) && (
                  <Button onClick={() => edit(entry)}>
                    {t('Review / edit #')}
                    {entry.id}
                  </Button>
                )}
              {history === entry.id && (
                <Stack spacing={1} aria-label={`History for entry ${entry.id}`}>
                  {events.data?.truncated && (
                    <Typography>{t('Latest 100 revisions shown.')} </Typography>
                  )}
                  {events.data?.events.map((event) => (
                    <Typography key={event.id} variant="body2">
                      {t('Revision')} {event.version} · {actor(event.actorId)} ·{' '}
                      {new Date(event.createdAt).toLocaleString(useLanguage.getState().language)} ·{' '}
                      {event.snapshot.status} · {event.snapshot.text} {t('· owner')}{' '}
                      {actor(event.snapshot.ownerId)} · {event.snapshot.priority} {t('priority')}{' '}
                      {event.snapshot.dueAt
                        ? ` · due ${new Date(event.snapshot.dueAt).toLocaleString(useLanguage.getState().language)}`
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
                    : t('New handover entry')}
                </Typography>
                {offlineReview && (
                  <Alert severity="warning">
                    <Stack spacing={1}>
                      <Typography>
                        {t(
                          'Review before sending. Nothing is submitted on reconnect. Changed server revisions are refused; discard this draft and edit the latest entry to resolve a conflict.',
                          'Vor dem Senden prüfen. Beim Wiederverbinden wird nichts übermittelt. Geänderte Serverversionen werden abgelehnt; verwerfen Sie den Entwurf und bearbeiten Sie den neuesten Eintrag, um einen Konflikt zu lösen.',
                        )}
                      </Typography>
                      {currentEntry && (
                        <Typography sx={{ overflowWrap: 'anywhere' }}>
                          {t('Current server entry', 'Aktueller Servereintrag')} #{currentEntry.id}{' '}
                          · {t('Revision', 'Version')} {currentEntry.version}: {currentEntry.text}
                        </Typography>
                      )}
                      <Button
                        disabled={!online || busy}
                        onClick={() => void reviewDraft(offlineReview)}
                      >
                        {t('Refresh review', 'Prüfung aktualisieren')}
                      </Button>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={reviewed}
                            disabled={!online || !reviewReady}
                            onChange={(event) => setReviewed(event.target.checked)}
                          />
                        }
                        label={t(
                          'I reviewed the current context and this draft',
                          'Ich habe den aktuellen Kontext und diesen Entwurf geprüft',
                        )}
                      />
                    </Stack>
                  </Alert>
                )}
                <TextField
                  select
                  label={t('Entry type')}
                  value={draft.kind}
                  disabled={!!editing}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                >
                  <MenuItem value="note">{t('Handover note')} </MenuItem>
                  <MenuItem value="action">{t('Assigned action')} </MenuItem>
                  <MenuItem value="quantity">{t('Manual quantity declaration')} </MenuItem>
                  <MenuItem value="state">{t('Manual state interval')} </MenuItem>
                </TextField>
                <TextField
                  required
                  multiline
                  minRows={2}
                  label={t('Observation / action')}
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  slotProps={{ htmlInput: { maxLength: 4000 } }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    select
                    label={t('Priority')}
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                  >
                    <MenuItem value="normal">{t('Normal')} </MenuItem>
                    <MenuItem value="high">{t('High')} </MenuItem>
                  </TextField>
                  <TextField
                    fullWidth
                    select
                    label={t('Action owner')}
                    value={draft.ownerId}
                    required={draft.kind === 'action'}
                    onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
                  >
                    <MenuItem value="">{t('Unassigned')} </MenuItem>
                    {owners.data?.map((owner) => (
                      <MenuItem key={owner.id} value={owner.id}>
                        {owner.username}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <TextField
                  label={t('Due date (ISO with timezone, optional)')}
                  placeholder={t('2026-10-26T18:00:00+01:00')}
                  value={draft.dueAt}
                  onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
                />
                {!editing && (
                  <>
                    <TextField
                      select
                      label={t('Linked shift')}
                      value={draft.shiftId}
                      required={reviewedKinds.includes(draft.kind)}
                      onChange={(e) => setDraft({ ...draft, shiftId: e.target.value })}
                    >
                      <MenuItem value="">{t('No shift')} </MenuItem>
                      {shifts.data
                        ?.filter((shift) => shift.machineId === Number(machine))
                        .map((shift) => (
                          <MenuItem key={shift.id} value={shift.id}>
                            {shift.name}
                          </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                      label={t('Observation start (ISO with timezone, optional)')}
                      value={draft.intervalStart}
                      onChange={(e) => setDraft({ ...draft, intervalStart: e.target.value })}
                    />
                    <TextField
                      label={t('Observation end (ISO with timezone, optional)')}
                      value={draft.intervalEnd}
                      onChange={(e) => setDraft({ ...draft, intervalEnd: e.target.value })}
                    />
                    {draft.kind === 'state' && (
                      <>
                        <Alert severity="info">
                          {t(
                            'Declare what the machine did over the observation interval for review. It fills only time without a usable machine state and never verifies the shift report.',
                          )}
                        </Alert>
                        <TextField
                          select
                          required
                          label={t('Declared state')}
                          value={draft.manualState}
                          onChange={(e) => setDraft({ ...draft, manualState: e.target.value })}
                        >
                          {['running', 'idle', 'fault', 'planned'].map((state) => (
                            <MenuItem key={state} value={state}>
                              {state}
                            </MenuItem>
                          ))}
                        </TextField>
                      </>
                    )}
                    {draft.kind === 'quantity' && (
                      <>
                        <Alert severity="info">
                          {t(
                            'Declare independent counts for review. This does not replace measurements or verify the shift report.',
                          )}{' '}
                        </Alert>
                        <TextField
                          required
                          type="number"
                          label={t('Declared total')}
                          value={draft.total}
                          onChange={(e) => setDraft({ ...draft, total: e.target.value })}
                        />
                        <TextField
                          required
                          type="number"
                          label={t('Declared good')}
                          value={draft.good}
                          onChange={(e) => setDraft({ ...draft, good: e.target.value })}
                        />
                        <TextField
                          required
                          type="number"
                          label={t('Declared reject')}
                          value={draft.reject}
                          onChange={(e) => setDraft({ ...draft, reject: e.target.value })}
                        />
                      </>
                    )}
                  </>
                )}
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={
                      busy ||
                      !quantityReady ||
                      !online ||
                      (!!offlineReview && (!reviewReady || !reviewed))
                    }
                  >
                    {t('Save handover')}{' '}
                  </Button>
                  {editing && (
                    <Button
                      disabled={busy || !online || (!!offlineReview && (!reviewReady || !reviewed))}
                      onClick={() => void save(editing.status === 'open' ? 'resolved' : 'open')}
                    >
                      {editing.status === 'open' ? t('Resolve / mark reviewed') : t('Reopen entry')}
                    </Button>
                  )}
                  <Button disabled={busy} onClick={clear}>
                    {t('New entry / cancel edit')}{' '}
                  </Button>
                  <Button
                    disabled={busy || !draft.text.trim() || !quantityReady || !!offlineReview}
                    onClick={keepDraft}
                  >
                    {t('Keep draft on this device', 'Entwurf auf diesem Gerät speichern')}
                  </Button>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {t(
                    'Device drafts expire after 24 hours. Sign out to erase them on shared devices. Offline reloads require sign-in verification before drafts can be opened.',
                    'Geräteentwürfe verfallen nach 24 Stunden. Auf gemeinsam genutzten Geräten zum Löschen abmelden. Nach Offline-Neuladen muss die Anmeldung vor dem Öffnen bestätigt werden.',
                  )}
                </Typography>
              </Stack>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
