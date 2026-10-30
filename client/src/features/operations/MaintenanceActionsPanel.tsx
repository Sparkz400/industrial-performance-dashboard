import React, { useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { operationRequest, localInput, toIso } from './api';
import CmmsHandoffPanel from './CmmsHandoffPanel';
interface Action {
  id: number;
  version: number;
  action: string;
  owner_id: number;
  escalation_owner_id: number;
  due_at: string;
  suppression_until: string | null;
  quiet_start: number | null;
  quiet_end: number | null;
  outcome: string;
  repeated_alarms: number;
  notification_failures: number;
  escalated_at: string | null;
  completed_at: string | null;
  created_at: string;
  completion_note: string | null;
  completed_by: number | null;
}
interface Revision {
  changedBy: number;
  changedAt: string;
  reason: string;
  previous: {
    version: number;
    action: string;
    owner_id: number;
    escalation_owner_id: number;
    due_at: string;
  };
}
/**
 *
 * @param root0
 * @param root0.action
 * @param root0.ownerName
 */
function CorrectionHistory({
  action,
  ownerName,
}: {
  action: Action;
  ownerName: (id: number) => string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [cursors, setCursors] = useState([0]);
  const after = cursors[cursors.length - 1];
  const history = useQuery({
    queryKey: ['maintenance-action-history', action.id, action.version, after],
    queryFn: () =>
      operationRequest<{ revisions: Revision[]; next: number | null }>(
        `/maintenance-actions/${action.id}/revisions?after=${after}`,
      ),
    enabled: open,
  });
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t('Correction history', 'Korrekturverlauf')}</summary>
      {history.isFetching && <Typography role="status">{t('Loading…')}</Typography>}
      {history.error && <Alert severity="error">{String(history.error)}</Alert>}
      {history.data?.revisions.length === 0 && (
        <Typography>{t('No corrections.', 'Keine Korrekturen.')}</Typography>
      )}
      {history.data?.revisions.map((r) => (
        <Stack key={r.previous.version} spacing={1} sx={{ mt: 1 }}>
          <Typography>
            {t('Revision', 'Version')} {r.previous.version}: {r.previous.action} ·{' '}
            {ownerName(r.previous.owner_id)} · {new Date(r.previous.due_at).toLocaleString()}
          </Typography>
          <Typography>
            {r.reason} · {ownerName(r.changedBy)} · {new Date(r.changedAt).toLocaleString()}
          </Typography>
        </Stack>
      ))}
      <Button
        disabled={cursors.length === 1 || history.isFetching}
        onClick={() => setCursors(cursors.slice(0, -1))}
      >
        {t('Previous corrections', 'Vorherige Korrekturen')}
      </Button>
      <Button
        disabled={history.data?.next == null || history.isFetching}
        onClick={() => setCursors([...cursors, history.data!.next!])}
      >
        {t('Next corrections', 'Weitere Korrekturen')}
      </Button>
    </details>
  );
}
const time = (minute: number | null) =>
  minute == null
    ? ''
    : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
/**
 * Assign, revise and verify machine-scoped maintenance work.
 * @param root0
 * @param root0.machineId
 */
export default function MaintenanceActionsPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    recovery = useAuthStore((s) => s.user?.recoveryMode);
  const [alarm, setAlarm] = useState(''),
    [owner, setOwner] = useState(''),
    [escalation, setEscalation] = useState(''),
    [action, setAction] = useState(''),
    [due, setDue] = useState(localInput(new Date(Date.now() + 86400000).toISOString())),
    [suppression, setSuppression] = useState(''),
    [quietStart, setQuietStart] = useState(''),
    [quietEnd, setQuietEnd] = useState(''),
    [editing, setEditing] = useState<Action | null>(null),
    [reason, setReason] = useState(''),
    [selected, setSelected] = useState<Action | null>(null),
    [service, setService] = useState(''),
    [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const actions = useQuery({
    queryKey: ['maintenance-actions', machineId],
    queryFn: () => operationRequest<Action[]>(`/maintenance-actions/machines/${machineId}`),
  });
  const alarms = useQuery({
    queryKey: ['action-alarms', machineId],
    queryFn: () =>
      operationRequest<{ id: number; message: string }[]>(`/alarms?machineId=${machineId}`),
  });
  const owners = useQuery({
    queryKey: ['action-owners', machineId],
    queryFn: () =>
      operationRequest<{ id: number; username: string }[]>(
        `/maintenance-actions/machines/${machineId}/owners`,
      ),
  });
  const plans = useQuery({
    queryKey: ['action-inspections', machineId],
    queryFn: () =>
      operationRequest<
        {
          id: number;
          config: { name: string };
          events: { id: number; serviced: boolean; createdAt: string }[];
        }[]
      >(`/maintenance/machines/${machineId}`),
  });
  const ownerName = (id: number) => owners.data?.find((o) => o.id === id)?.username ?? String(id);
  const outcome = (value: string) =>
    new Map(
      Object.entries({
        open: t('Open', 'Offen'),
        recurred: t('Alarm recurred', 'Alarm erneut aufgetreten'),
        'awaiting-recovery': t('Awaiting measured recovery', 'Wartet auf gemessene Erholung'),
        'recovered-observed': t('Recovery observed', 'Erholung beobachtet'),
      }),
    ).get(value) ?? value;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await actions.refetch();
      setMessage(t('Saved.', 'Gespeichert.'));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const edit = (a: Action | null) => {
    setEditing(a);
    setReason('');
    setOwner(a ? String(a.owner_id) : '');
    setEscalation(a ? String(a.escalation_owner_id) : '');
    setAction(a?.action ?? '');
    setDue(localInput(a?.due_at ?? new Date(Date.now() + 86400000).toISOString()));
    setSuppression(a?.suppression_until ? localInput(a.suppression_until) : '');
    setQuietStart(time(a?.quiet_start ?? null));
    setQuietEnd(time(a?.quiet_end ?? null));
  };
  const minute = (value: string) =>
    value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  const queryError = actions.error || alarms.error || owners.error || plans.error;
  return (
    <Stack
      spacing={2}
      sx={{ minWidth: 0, overflowWrap: 'anywhere', '& .MuiButton-root': { minHeight: 44 } }}
    >
      <Typography variant="h5">
        {t('Alarm maintenance actions', 'Alarmbezogene Instandhaltung')}
      </Typography>
      <Alert severity="info">
        {t(
          'Suppression expires within 24 hours and delays notifications; alarm collection continues. Quiet hours use UTC. Completing a service does not prove recovery; the measured alarm condition must clear.',
          'Die Unterdrückung endet innerhalb von 24 Stunden und verzögert Benachrichtigungen; Alarme werden weiter erfasst. Ruhezeiten gelten in UTC. Eine abgeschlossene Wartung belegt keine Erholung; die gemessene Alarmbedingung muss enden.',
        )}
      </Alert>
      {(error || queryError) && <Alert severity="error">{error || String(queryError)}</Alert>}
      {message && (
        <Alert severity="success" role="status">
          {message}
        </Alert>
      )}
      {actions.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
      {!actions.isLoading && !actions.error && !actions.data?.length && (
        <Typography>
          {t(
            'No maintenance actions for this machine.',
            'Keine Instandhaltungsmaßnahmen für diese Maschine.',
          )}
        </Typography>
      )}
      <Button disabled={busy} onClick={() => void actions.refetch()}>
        {t('Refresh recovery status', 'Erholungsstatus aktualisieren')}
      </Button>
      {actions.data?.map((a) => (
        <Paper key={a.id} sx={{ p: 2 }}>
          <Typography variant="h6">{a.action}</Typography>
          <Typography>
            {t('Owner', 'Verantwortlich')}: {ownerName(a.owner_id)} · {t('Deadline', 'Frist')}:{' '}
            {new Date(a.due_at).toLocaleString()} · {t('Revision', 'Version')} {a.version}
          </Typography>
          <Typography>
            {outcome(a.outcome)} · {t('Repeated alarms', 'Wiederholte Alarme')}: {a.repeated_alarms}{' '}
            ·{' '}
            {t(
              'Pending notification failures on this machine',
              'Ausstehende fehlgeschlagene Benachrichtigungen dieser Maschine',
            )}
            : {a.notification_failures} ·{' '}
            {a.escalated_at ? t('Escalated', 'Eskaliert') : t('Not escalated', 'Nicht eskaliert')}
          </Typography>
          {a.completion_note && (
            <Typography>
              {t('Intervention result', 'Ergebnis des Eingriffs')}: {a.completion_note} ·{' '}
              {a.completed_by && ownerName(a.completed_by)}
            </Typography>
          )}
          {a.version > 1 && <CorrectionHistory key={a.version} action={a} ownerName={ownerName} />}
        </Paper>
      ))}
      <Typography variant="h6">
        {t('Assign or correct work', 'Arbeit zuweisen oder korrigieren')}
      </Typography>
      <TextField
        select
        label={t('Action to revise', 'Zu korrigierende Maßnahme')}
        value={editing?.id ?? ''}
        onChange={(e) => edit(actions.data?.find((a) => a.id === Number(e.target.value)) ?? null)}
      >
        <MenuItem value="">{t('New action', 'Neue Maßnahme')}</MenuItem>
        {(actions.data ?? [])
          .filter((a) => !a.completed_at)
          .map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.action}
            </MenuItem>
          ))}
      </TextField>
      {!editing && (
        <TextField
          select
          label={t('Alarm for action', 'Alarm für Maßnahme')}
          value={alarm}
          onChange={(e) => setAlarm(e.target.value)}
        >
          {(alarms.data ?? []).map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.message}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        select
        label={t('Action owner', 'Maßnahmenverantwortliche Person')}
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
      >
        {(owners.data ?? []).map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.username}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label={t('Escalation owner', 'Eskalationsverantwortliche Person')}
        value={escalation}
        onChange={(e) => setEscalation(e.target.value)}
      >
        {(owners.data ?? []).map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.username}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label={t('Maintenance action', 'Instandhaltungsmaßnahme')}
        value={action}
        onChange={(e) => setAction(e.target.value)}
        multiline
        minRows={2}
      />
      <TextField
        label={t('Action deadline', 'Maßnahmenfrist')}
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <TextField
        label={t('Suppress notifications until', 'Benachrichtigungen aussetzen bis')}
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        helperText={t('Optional; at most 24 hours', 'Optional; höchstens 24 Stunden')}
        value={suppression}
        onChange={(e) => setSuppression(e.target.value)}
      />
      <TextField
        label={t('Quiet hours start (UTC, optional)', 'Beginn der Ruhezeit (UTC, optional)')}
        type="time"
        slotProps={{ inputLabel: { shrink: true } }}
        value={quietStart}
        onChange={(e) => setQuietStart(e.target.value)}
      />
      <TextField
        label={t('Quiet hours end (UTC, optional)', 'Ende der Ruhezeit (UTC, optional)')}
        type="time"
        slotProps={{ inputLabel: { shrink: true } }}
        value={quietEnd}
        onChange={(e) => setQuietEnd(e.target.value)}
      />
      {editing && (
        <TextField
          label={t('Reason for correction', 'Korrekturgrund')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
        />
      )}
      <Button
        disabled={
          busy ||
          recovery ||
          (!editing && !alarm) ||
          !owner ||
          !escalation ||
          !action.trim() ||
          !due ||
          (!!editing && !reason.trim())
        }
        onClick={() =>
          void run(async () => {
            const body = {
              ownerId: Number(owner),
              escalationOwnerId: Number(escalation),
              action,
              dueAt: editing && due === localInput(editing.due_at) ? editing.due_at : toIso(due),
              suppressionUntil: suppression ? toIso(suppression) : null,
              quietStart: minute(quietStart),
              quietEnd: minute(quietEnd),
            };
            if (editing)
              await operationRequest(`/maintenance-actions/${editing.id}/revise`, 'POST', {
                ...body,
                version: editing.version,
                reason,
              });
            else
              await operationRequest(`/maintenance-actions/machines/${machineId}`, 'POST', {
                ...body,
                alarmId: Number(alarm),
              });
            edit(null);
            setAlarm('');
          })
        }
      >
        {editing
          ? t('Save correction', 'Korrektur speichern')
          : t('Assign maintenance action', 'Instandhaltungsmaßnahme zuweisen')}
      </Button>
      <Typography variant="h6">
        {t('Record completed intervention', 'Abgeschlossenen Eingriff erfassen')}
      </Typography>
      <TextField
        select
        label={t('Action to complete', 'Abzuschließende Maßnahme')}
        value={selected?.id ?? ''}
        onChange={(e) => {
          setSelected(actions.data?.find((a) => a.id === Number(e.target.value)) ?? null);
          setService('');
        }}
      >
        {(actions.data ?? [])
          .filter((a) => !a.completed_at)
          .map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.action}
            </MenuItem>
          ))}
      </TextField>
      <TextField
        select
        label={t('Completed service inspection', 'Abgeschlossene Wartungsprüfung')}
        value={service}
        onChange={(e) => setService(e.target.value)}
      >
        {(plans.data ?? []).flatMap((p) =>
          p.events
            .filter(
              (e) =>
                e.serviced &&
                selected &&
                Date.parse(e.createdAt) >= Date.parse(selected.created_at),
            )
            .map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {p.config.name} · {new Date(e.createdAt).toLocaleString()}
              </MenuItem>
            )),
        )}
      </TextField>
      <TextField
        label={t('Intervention result', 'Ergebnis des Eingriffs')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        multiline
      />
      <Button
        disabled={busy || recovery || !selected || !service || !note.trim()}
        onClick={() =>
          void run(async () => {
            await operationRequest(`/maintenance-actions/${selected!.id}/complete`, 'POST', {
              version: selected!.version,
              serviceEventId: Number(service),
              note,
            });
            setSelected(null);
            setService('');
            setNote('');
          })
        }
      >
        {t('Record completed intervention', 'Abgeschlossenen Eingriff erfassen')}
      </Button>
      <CmmsHandoffPanel key={machineId} machineId={machineId} />
    </Stack>
  );
}
