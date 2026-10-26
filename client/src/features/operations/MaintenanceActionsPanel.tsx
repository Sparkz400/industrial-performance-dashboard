import React, { useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { operationRequest, localInput, toIso } from './api';
interface Action {
  id: number;
  action: string;
  owner_id: number;
  due_at: string;
  outcome: string;
  repeated_alarms: number;
  notification_failures: number;
  escalated_at: string | null;
  completed_at: string | null;
}
/**
 *
 * @param root0
 * @param root0.machineId
 */
export default function MaintenanceActionsPanel({ machineId }: { machineId: number }) {
  const [alarm, setAlarm] = useState(''),
    [owner, setOwner] = useState(''),
    [escalation, setEscalation] = useState(''),
    [action, setAction] = useState(''),
    [due, setDue] = useState(localInput(new Date(Date.now() + 86400000).toISOString())),
    [suppression, setSuppression] = useState(''),
    [quietStart, setQuietStart] = useState(''),
    [quietEnd, setQuietEnd] = useState(''),
    [selected, setSelected] = useState(''),
    [service, setService] = useState(''),
    [note, setNote] = useState(''),
    [error, setError] = useState(''),
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
    queryKey: ['action-owners'],
    queryFn: () =>
      operationRequest<{ id: number; username: string }[]>('/production/operator/owners'),
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
  const save = async (path: string, body: unknown) => {
    setBusy(true);
    setError('');
    try {
      await operationRequest(path, 'POST', body);
      await actions.refetch();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const minute = (value: string) =>
    value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Alarm maintenance actions</Typography>
      <Alert severity="info">
        Suppression expires within 24 hours and delays notifications; alarm collection continues.
        Quiet hours use UTC. Completing a service does not prove recovery; the measured alarm
        condition must clear.
      </Alert>
      {(error || actions.error) && <Alert severity="error">{error || String(actions.error)}</Alert>}
      {actions.data?.map((a) => (
        <Paper key={a.id} sx={{ p: 2 }}>
          <Typography>
            {a.action} · {owners.data?.find((o) => o.id === a.owner_id)?.username ?? a.owner_id} ·
            due {new Date(a.due_at).toLocaleString()}
          </Typography>
          <Typography>
            {a.outcome} · repeated alarms {a.repeated_alarms} · pending notification failures on
            this machine {a.notification_failures} ·{' '}
            {a.escalated_at ? 'Escalated' : 'Not escalated'}
          </Typography>
        </Paper>
      ))}
      <TextField
        select
        label="Alarm for action"
        value={alarm}
        onChange={(e) => setAlarm(e.target.value)}
      >
        {alarms.data?.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.message}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Action owner"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
      >
        {owners.data?.map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.username}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Escalation owner"
        value={escalation}
        onChange={(e) => setEscalation(e.target.value)}
      >
        {owners.data?.map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.username}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Maintenance action"
        value={action}
        onChange={(e) => setAction(e.target.value)}
      />
      <TextField
        label="Action deadline"
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <TextField
        label="Suppress notifications until (optional, maximum 24 hours)"
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={suppression}
        onChange={(e) => setSuppression(e.target.value)}
      />
      <TextField
        label="Quiet hours start (UTC, optional)"
        type="time"
        slotProps={{ inputLabel: { shrink: true } }}
        value={quietStart}
        onChange={(e) => setQuietStart(e.target.value)}
      />
      <TextField
        label="Quiet hours end (UTC, optional)"
        type="time"
        slotProps={{ inputLabel: { shrink: true } }}
        value={quietEnd}
        onChange={(e) => setQuietEnd(e.target.value)}
      />
      <Button
        disabled={busy || !alarm || !owner || !escalation || !action || !due}
        onClick={() =>
          void save(`/maintenance-actions/machines/${machineId}`, {
            alarmId: Number(alarm),
            ownerId: Number(owner),
            escalationOwnerId: Number(escalation),
            action,
            dueAt: toIso(due),
            suppressionUntil: suppression ? toIso(suppression) : null,
            quietStart: minute(quietStart),
            quietEnd: minute(quietEnd),
          })
        }
      >
        Assign maintenance action
      </Button>
      <TextField
        select
        label="Action to complete"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {actions.data
          ?.filter((a) => !a.completed_at)
          .map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.action}
            </MenuItem>
          ))}
      </TextField>
      <TextField
        select
        label="Completed service inspection"
        value={service}
        onChange={(e) => setService(e.target.value)}
      >
        {plans.data?.flatMap((p) =>
          p.events
            .filter((e) => e.serviced)
            .map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {p.config.name} · {new Date(e.createdAt).toLocaleString()}
              </MenuItem>
            )),
        )}
      </TextField>
      <TextField
        label="Intervention result"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        disabled={busy || !selected || !service || !note}
        onClick={() =>
          void save(`/maintenance-actions/${selected}/complete`, {
            serviceEventId: Number(service),
            note,
          })
        }
      >
        Record completed intervention
      </Button>
    </Stack>
  );
}
