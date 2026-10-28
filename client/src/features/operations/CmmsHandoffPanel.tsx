import React, { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useLanguage, useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { operationRequest } from './api';
import { downloadJson } from '../production/CommissioningPanel';
interface Payload {
  source: string;
  externalId: string;
  handoffId?: string;
  asset: { id: string; name: string };
  action: {
    id: number;
    version: number;
    description: string;
    dueAt: string;
    completedAt: string | null;
  };
  incident: { id: number; name: string; message: string };
}
interface Preview {
  review: Record<string, unknown>;
  signature: string;
  payload: Payload;
  destination: { id: number; name: string; origin: string | null };
}
interface Handoff {
  id: string;
  payload: Payload;
  destination_name: string;
  delivered_at: string | null;
  attempts: number;
  last_status: number | null;
  blocked: boolean;
}
/**
 * Review a stable maintenance request before exporting or queueing delivery.
 * @param root0 Panel scope.
 * @param root0.machineId Assigned machine to review.
 */
export default function CmmsHandoffPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    language = useLanguage((s) => s.language),
    recovery = useAuthStore((s) => s.user?.recoveryMode);
  const [source, setSource] = useState(''),
    [action, setAction] = useState(''),
    [destination, setDestination] = useState('0'),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  useEffect(() => {
    setAction('');
    setPreview(null);
    setError('');
    setSent(false);
  }, [machineId]);
  const actions = useQuery({
    queryKey: ['maintenance-actions', machineId],
    queryFn: () =>
      operationRequest<{ id: number; action: string }[]>(
        `/maintenance-actions/machines/${machineId}`,
      ),
  });
  const destinations = useQuery({
    queryKey: ['cmms-destinations', machineId],
    queryFn: () =>
      operationRequest<{ id: number; name: string }[]>(`/cmms/machines/${machineId}/destinations`),
  });
  const handoffs = useQuery({
    queryKey: ['cmms-handoffs', machineId],
    queryFn: () =>
      operationRequest<{ rows: Handoff[]; truncated: boolean }>(
        `/cmms/machines/${machineId}/handoffs`,
      ),
    refetchInterval: 5000,
  });
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setSent(false);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper sx={{ p: 2, minWidth: 0 }}>
      <Stack spacing={2}>
        <Typography variant="h6">{t('Maintenance handoff', 'Instandhaltungsübergabe')}</Typography>
        <Alert severity="info">
          {t(
            'Review a request before export or delivery. Use a unique, stable installation reference. The receiver must deduplicate the source and external action ID; transport acceptance does not confirm a remote work order.',
            'Anfrage vor Export oder Versand prüfen. Eine eindeutige, dauerhafte Anlagenreferenz verwenden. Der Empfänger muss Quelle und Aktionskennung deduplizieren; Transportannahme bestätigt keinen externen Arbeitsauftrag.',
          )}
        </Alert>
        {(error || actions.error || destinations.error || handoffs.error) && (
          <Alert severity="error">
            {error || String(actions.error || destinations.error || handoffs.error)}
          </Alert>
        )}
        {sent && (
          <Alert severity="success" role="status">
            {t(
              'Reviewed handoff queued. Inspect delivery status below.',
              'Geprüfte Übergabe eingereiht. Zustellstatus unten prüfen.',
            )}
          </Alert>
        )}
        <TextField
          label={t('Installation reference', 'Anlagenreferenz')}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPreview(null);
          }}
          inputProps={{ maxLength: 100 }}
        />
        <TextField
          select
          label={t('Maintenance action', 'Instandhaltungsmaßnahme')}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPreview(null);
          }}
        >
          {actions.data?.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              #{a.id} · {a.action}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label={t('Handoff destination', 'Übergabeziel')}
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setPreview(null);
          }}
        >
          <MenuItem value="0">{t('File export only', 'Nur Dateiexport')}</MenuItem>
          {destinations.data?.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.name}
            </MenuItem>
          ))}
        </TextField>
        {!destinations.data?.length && (
          <Typography>
            {t(
              'An administrator can configure a webhook destination for the cmms.handoff event. File export is available without a destination.',
              'Die Administration kann ein Webhook-Ziel für cmms.handoff konfigurieren. Dateiexport ist ohne Ziel verfügbar.',
            )}
          </Typography>
        )}
        <Button
          disabled={busy || recovery || !source.trim() || !action}
          onClick={() =>
            void run(async () => {
              setPreview(
                await operationRequest<Preview>(`/cmms/machines/${machineId}/preview`, 'POST', {
                  source,
                  actionId: Number(action),
                  webhookId: Number(destination),
                }),
              );
            })
          }
        >
          {t('Preview maintenance handoff', 'Instandhaltungsübergabe prüfen')}
        </Button>
        {preview && (
          <Stack spacing={1} sx={{ overflowWrap: 'anywhere' }}>
            <Typography fontWeight="bold">
              {preview.payload.asset.name} · {preview.payload.source} / {preview.payload.externalId}
            </Typography>
            <Typography>{preview.payload.action.description}</Typography>
            <Typography>
              {t('Due', 'Fällig')}:{' '}
              {new Date(preview.payload.action.dueAt).toLocaleString(language)} ·{' '}
              {preview.payload.action.completedAt
                ? t('Completed', 'Abgeschlossen')
                : t('Open', 'Offen')}
            </Typography>
            <Typography>
              {preview.payload.incident.name}: {preview.payload.incident.message}
            </Typography>
            <Typography>
              {t('Action revision', 'Maßnahmenrevision')}: {preview.payload.action.version} ·{' '}
              {t('Destination', 'Ziel')}: {preview.destination.name} {preview.destination.origin}
            </Typography>
            <Button onClick={() => downloadJson(preview.payload, 'maintenance-handoff.json')}>
              {t('Export reviewed request', 'Geprüfte Anfrage exportieren')}
            </Button>
            {preview.destination.id > 0 && (
              <Button
                disabled={busy || recovery}
                onClick={() =>
                  void run(async () => {
                    await operationRequest(`/cmms/machines/${machineId}/handoffs`, 'POST', {
                      review: preview.review,
                      signature: preview.signature,
                    });
                    setPreview(null);
                    await handoffs.refetch();
                    setSent(true);
                  })
                }
              >
                {t('Send reviewed handoff', 'Geprüfte Übergabe senden')}
              </Button>
            )}
          </Stack>
        )}
        {handoffs.data?.truncated && (
          <Alert severity="warning">
            {t('Showing the latest 100 handoffs.', 'Die letzten 100 Übergaben werden angezeigt.')}
          </Alert>
        )}
        {handoffs.data?.rows.map((h) => (
          <Paper variant="outlined" key={h.id} sx={{ p: 2, overflowWrap: 'anywhere' }}>
            <Stack spacing={1}>
              <Typography>
                #{h.payload.action.id} · {h.destination_name}
              </Typography>
              <Typography>
                {h.delivered_at
                  ? t('Transport accepted', 'Transport angenommen')
                  : h.blocked
                    ? t(
                        'Blocked: destination changed or disabled',
                        'Blockiert: Ziel geändert oder deaktiviert',
                      )
                    : h.attempts
                      ? t('Pending retry', 'Wiederholung ausstehend')
                      : t('Queued', 'Eingereiht')}{' '}
                · {t('Attempts', 'Versuche')}: {h.attempts}
              </Typography>
              <Typography variant="caption">{h.id}</Typography>
              <Button onClick={() => downloadJson(h.payload, `maintenance-handoff-${h.id}.json`)}>
                {t('Export preserved handoff', 'Bewahrte Übergabe exportieren')}
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}
