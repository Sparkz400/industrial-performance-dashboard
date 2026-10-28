import React, { useState } from 'react';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage, useT } from '@/i18n';
import { operationRequest } from './api';
import { downloadJson } from '../production/CommissioningPanel';

interface ReviewResult {
  source: string;
  applied: boolean;
  token?: string;
  review: {
    expiresAt: string;
    rows: {
      index: number;
      externalId: string;
      status: 'ready' | 'unchanged' | 'rejected';
      reason?: string;
      shiftId?: number;
      order?: {
        product: string;
        target: number | null;
        start: string;
        end: string;
        timezone: string;
      };
    }[];
  };
}
const sample = () => {
  const start = new Date(Date.now() + 86400000);
  start.setUTCMinutes(0, 0, 0);
  return JSON.stringify(
    {
      version: 'work-orders-v1',
      source: 'example-system',
      orders: [
        {
          externalId: 'ORDER-001',
          product: 'Part A',
          target: 100,
          start: start.toISOString(),
          end: new Date(start.getTime() + 3600000).toISOString(),
          timezone: 'Europe/Berlin',
        },
      ],
    },
    null,
    2,
  );
};
/**
 * Preview an explicitly imported order document before creating production shifts.
 * @param root0
 * @param root0.machineId
 */
export default function WorkOrderPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    language = useLanguage((s) => s.language),
    queryClient = useQueryClient();
  const [text, setText] = useState(sample),
    [review, setReview] = useState<ReviewResult | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
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
  const update = (value: string) => {
    setText(value);
    setReview(null);
  };
  const document = () => {
    if (text.length > 1048576)
      throw new Error(t('The document exceeds 1 MiB.', 'Das Dokument überschreitet 1 MiB.'));
    return JSON.parse(text);
  };
  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="h5">{t('Work-order exchange', 'Auftragsaustausch')}</Typography>
      <Alert severity="info">
        {t(
          'Import up to 100 orders for this machine. Preview all accepted and rejected rows, then confirm. Existing orders are never overwritten. Completion exports contain saved report facts; no external system or machine is changed.',
          'Bis zu 100 Aufträge für diese Maschine importieren. Angenommene und abgelehnte Zeilen prüfen und dann bestätigen. Bestehende Aufträge werden nie überschrieben. Fertigmeldungsexporte enthalten gespeicherte Berichtsfakten; externe Systeme und Maschinen werden nicht geändert.',
        )}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <Button component="label" disabled={busy}>
        {t('Open JSON document', 'JSON-Dokument öffnen')}
        <input
          hidden
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void run(async () => {
              if (file.size > 1048576)
                throw new Error(
                  t('The document exceeds 1 MiB.', 'Das Dokument überschreitet 1 MiB.'),
                );
              update(await file.text());
            });
          }}
        />
      </Button>
      <TextField
        label={t('Order document', 'Auftragsdokument')}
        value={text}
        multiline
        minRows={8}
        maxRows={16}
        disabled={busy}
        onChange={(e) => update(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 1048576, spellCheck: false } }}
      />
      <Typography variant="body2">
        {t(
          'Each order needs a stable externalId, product, target (or null), start/end with UTC offset and IANA timezone. One order becomes one shift; use Planning for multiple product runs or later corrections.',
          'Jeder Auftrag benötigt eine stabile externalId, product, target (oder null), start/end mit UTC-Offset und eine IANA-Zeitzone. Ein Auftrag wird zu einer Schicht; mehrere Produktläufe oder spätere Korrekturen erfolgen in der Planung.',
        )}
      </Typography>
      <Button
        variant="contained"
        disabled={busy}
        onClick={() =>
          void run(async () =>
            setReview(
              await operationRequest(`/work-orders/machines/${machineId}/preview`, 'POST', {
                document: document(),
              }),
            ),
          )
        }
      >
        {t('Preview import', 'Import prüfen')}
      </Button>
      {review && (
        <>
          <Alert severity={review.applied ? 'success' : 'info'}>
            {review.applied
              ? t(
                  'Import completed. Rejected rows were not imported.',
                  'Import abgeschlossen. Abgelehnte Zeilen wurden nicht importiert.',
                )
              : `${t('Review valid until', 'Prüfung gültig bis')} ${new Date(review.review.expiresAt).toLocaleString(language)}`}
          </Alert>
          {review.review.rows.map((row) => (
            <Paper key={row.index} sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography variant="h6">
                  {row.index + 1}. {row.externalId || t('Missing external ID', 'Externe ID fehlt')}
                </Typography>
                <Typography>
                  {row.status === 'rejected'
                    ? t('Rejected', 'Abgelehnt')
                    : row.status === 'unchanged'
                      ? t('Already imported — unchanged', 'Bereits importiert — unverändert')
                      : review.applied
                        ? t('Imported', 'Importiert')
                        : t('Ready to import', 'Bereit zum Import')}
                </Typography>
                {row.order && (
                  <Typography>
                    {row.order.product} · {t('Target', 'Ziel')}: {row.order.target ?? t('Unknown')}{' '}
                    ·{' '}
                    {new Date(row.order.start).toLocaleString(language, {
                      timeZone: row.order.timezone,
                    })}{' '}
                    –{' '}
                    {new Date(row.order.end).toLocaleString(language, {
                      timeZone: row.order.timezone,
                    })}{' '}
                    · {row.order.timezone}
                  </Typography>
                )}
                {row.reason && <Alert severity="warning">{row.reason}</Alert>}
                {row.shiftId && (
                  <Typography>
                    {t('Shift', 'Schicht')} #{row.shiftId}
                  </Typography>
                )}
              </Stack>
            </Paper>
          ))}
          {!review.applied && (
            <Button
              variant="contained"
              disabled={busy || !review.review.rows.some((row) => row.status === 'ready')}
              onClick={() =>
                void run(async () => {
                  setReview(
                    await operationRequest(`/work-orders/machines/${machineId}/apply`, 'POST', {
                      document: document(),
                      review: review.review,
                      token: review.token,
                    }),
                  );
                  await queryClient.invalidateQueries({ queryKey: ['production-shifts'] });
                })
              }
            >
              {t('Confirm reviewed import', 'Geprüften Import bestätigen')}
            </Button>
          )}
          <Button
            disabled={busy}
            onClick={() => downloadJson(review, 'work-order-import-result.json')}
          >
            {t('Download review results', 'Prüfergebnisse herunterladen')}
          </Button>
        </>
      )}
      <Button
        disabled={busy}
        onClick={() =>
          void run(async () =>
            downloadJson(
              await operationRequest(`/work-orders/machines/${machineId}/completions`),
              `work-order-completions-${machineId}.json`,
            ),
          )
        }
      >
        {t('Export completion facts', 'Fertigmeldungsfakten exportieren')}
      </Button>
      <Typography variant="body2">
        {t(
          'The export includes at most the latest 100 imported orders and marks truncation. Unverified or missing reports never become confirmed completion quantities.',
          'Der Export enthält höchstens die letzten 100 importierten Aufträge und kennzeichnet eine Begrenzung. Ungeprüfte oder fehlende Berichte werden nie zu bestätigten Fertigmeldungsmengen.',
        )}
      </Typography>
    </Stack>
  );
}
