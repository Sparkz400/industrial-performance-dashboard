import React, { useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { AlarmReview, AlarmReplayReview } from '@performance-dashboard/shared';
import { formatNumber, useT } from '@/i18n';
import { operationRequest, localInput, toIso } from './api';
/**
 * Review recorded alarm burden and preview settings without changing live rules.
 * @param root0
 * @param root0.machineId
 */
export default function AlarmReviewPanel({ machineId }: { machineId: number }) {
  const t = useT();
  const [start, setStart] = useState(localInput(new Date(Date.now() - 86400000).toISOString())),
    [end, setEnd] = useState(localInput(new Date().toISOString())),
    [report, setReport] = useState<AlarmReview | null>(null),
    [replay, setReplay] = useState<AlarmReplayReview | null>(null),
    [rule, setRule] = useState(''),
    [hold, setHold] = useState('5'),
    [clearHold, setClearHold] = useState('5'),
    [hysteresis, setHysteresis] = useState('0'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const number = (v: number | null | undefined) => formatNumber(v, 1);
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
  const changed = () => {
    setReport(null);
    setReplay(null);
    setRule('');
  };
  return (
    <Stack
      spacing={2}
      sx={{ minWidth: 0, overflowWrap: 'anywhere', '& .MuiButton-root': { minHeight: 44 } }}
    >
      <Typography variant="h5">{t('Alarm usefulness', 'Alarmbewertung')}</Typography>
      <Alert severity="info">
        {t(
          'Review recorded alarm starts, repeat frequency and response times. Counts describe available history, not alarms that were never received. Repeated starts are investigation candidates, not proof that a rule is unnecessary.',
          'Prüfen Sie aufgezeichnete Alarmstarts, Wiederholungen und Reaktionszeiten. Die Zahlen beschreiben vorhandene Historie, keine nie empfangenen Alarme. Wiederholte Starts sind Untersuchungshinweise und kein Beleg für eine unnötige Regel.',
        )}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        disabled={busy}
        label={t('Review start', 'Beginn der Auswertung')}
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={start}
        onChange={(e) => {
          setStart(e.target.value);
          changed();
        }}
      />
      <TextField
        disabled={busy}
        label={t('Review end', 'Ende der Auswertung')}
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={end}
        onChange={(e) => {
          setEnd(e.target.value);
          changed();
        }}
        helperText={t(
          'At most seven days; recorded replay at most 48 hours.',
          'Höchstens sieben Tage; aufgezeichnete Wiedergabe höchstens 48 Stunden.',
        )}
      />
      <Button
        disabled={busy || !start || !end}
        onClick={() =>
          void run(async () => {
            setReplay(null);
            setReport(
              await operationRequest(
                `/alarm-review/machines/${machineId}?${new URLSearchParams({ start: toIso(start), end: toIso(end) })}`,
              ),
            );
          })
        }
      >
        {t('Review alarm history', 'Alarmhistorie auswerten')}
      </Button>
      {report && (
        <>
          {report.truncated && (
            <Alert severity="warning">
              {t(
                'The result is truncated. Counts are lower bounds and timing summaries are partial; shorten the window.',
                'Das Ergebnis ist gekürzt. Anzahlen sind Untergrenzen und Zeitstatistiken unvollständig; verkürzen Sie den Zeitraum.',
              )}
            </Alert>
          )}
          <Typography>
            {t('Recorded starts', 'Aufgezeichnete Starts')}: {report.alarmCount} ·{' '}
            {t('Peak starts in ten minutes', 'Maximale Starts in zehn Minuten')}:{' '}
            {report.peakTenMinuteStarts}
          </Typography>
          <Typography
            sx={{
              color: 'text.secondary',
            }}
          >
            {t(
              'Acknowledgements and delivery outcomes are read now, including outcomes after the selected window. Delivery delay starts when an event is queued. Deferred notifications describe current maintenance suppression or UTC quiet hours, not historical suppression.',
              'Quittierungen und Zustellergebnisse werden jetzt gelesen, auch nach dem gewählten Zeitraum. Die Zustellverzögerung beginnt mit dem Einreihen eines Ereignisses. Zurückgestellte Benachrichtigungen beschreiben aktuelle Wartungsunterdrückung oder UTC-Ruhezeiten, keine historische Unterdrückung.',
            )}
          </Typography>
          {!report.rules.length && (
            <Typography>
              {t(
                'No recorded alarm starts in this window.',
                'Keine aufgezeichneten Alarmstarts in diesem Zeitraum.',
              )}
            </Typography>
          )}
          {report.rules.map((r) => (
            <Paper key={r.key} sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography variant="h6">
                  {r.name === 'Unidentified alarm'
                    ? t('Unidentified alarm', 'Nicht zugeordneter Alarm')
                    : r.name}
                </Typography>
                <Typography>
                  {t(
                    'Starts / resolved / open at window end',
                    'Starts / beendet / am Intervallende offen',
                  )}
                  : {r.starts} / {r.resolved} / {r.openAtEnd}
                </Typography>
                <Typography>
                  {t(
                    'Repeat starts within 60 seconds',
                    'Wiederholte Starts innerhalb von 60 Sekunden',
                  )}
                  : {r.repeatsWithinMinute}
                </Typography>
                <Typography>
                  {t('Acknowledged', 'Quittiert')}: {r.acknowledged} ·{' '}
                  {t('Acknowledgement p50 / p95', 'Quittierung p50 / p95')}:{' '}
                  {number(r.acknowledgementP50Seconds)} / {number(r.acknowledgementP95Seconds)} s
                </Typography>
                <Typography>
                  {t(
                    'Queued deliveries / delivered / failed pending',
                    'Eingereihte Zustellungen / zugestellt / fehlgeschlagen ausstehend',
                  )}
                  : {r.deliveryCount} / {r.delivered} / {r.failedPending}
                </Typography>
                <Typography>
                  {t('Delivery delay p50 / p95', 'Zustellverzögerung p50 / p95')}:{' '}
                  {number(r.deliveryP50Seconds)} / {number(r.deliveryP95Seconds)} s ·{' '}
                  {t('Deferred now', 'Aktuell zurückgestellt')}: {r.deferredNow}
                </Typography>
              </Stack>
            </Paper>
          ))}
          <Typography variant="h6">
            {t('Preview recorded rule behavior', 'Aufgezeichnetes Regelverhalten prüfen')}
          </Typography>
          <Alert severity="info">
            {t(
              'This is a read-only scenario using the current rule and retained measurements. It never changes the rule or sends notifications. Initial state, missing clocks and gaps remain unknown; totals are not a promise of future alarm behavior.',
              'Dies ist ein schreibgeschütztes Szenario mit der aktuellen Regel und gespeicherten Messwerten. Es ändert keine Regel und sendet keine Benachrichtigungen. Anfangszustand, fehlende Zeitangaben und Lücken bleiben unbekannt; Summen sind keine Zusage für künftiges Alarmverhalten.',
            )}
          </Alert>
          <TextField
            disabled={busy}
            select
            label={t('Rule to preview', 'Zu prüfende Regel')}
            value={rule}
            onChange={(e) => {
              setRule(e.target.value);
              setReplay(null);
            }}
          >
            {report.rules
              .filter((r) => r.ruleId != null)
              .map((r) => (
                <MenuItem key={r.key} value={r.ruleId!}>
                  {r.name}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            disabled={busy}
            label={t('Trigger hold (seconds)', 'Auslöseverzögerung (Sekunden)')}
            type="number"
            value={hold}
            onChange={(e) => {
              setHold(e.target.value);
              setReplay(null);
            }}
          />
          <TextField
            disabled={busy}
            label={t('Clear hold (seconds)', 'Rücksetzverzögerung (Sekunden)')}
            type="number"
            value={clearHold}
            onChange={(e) => {
              setClearHold(e.target.value);
              setReplay(null);
            }}
          />
          <TextField
            disabled={busy}
            label={t('Hysteresis', 'Hysterese')}
            type="number"
            value={hysteresis}
            onChange={(e) => {
              setHysteresis(e.target.value);
              setReplay(null);
            }}
          />
          <Button
            disabled={busy || !rule || !hold || !clearHold || !hysteresis}
            onClick={() =>
              void run(async () =>
                setReplay(
                  await operationRequest(
                    `/alarm-review/machines/${machineId}/replay/${rule}?${new URLSearchParams({ start: toIso(start), end: toIso(end), debounceSeconds: hold, clearDebounceSeconds: clearHold, hysteresis })}`,
                  ),
                ),
              )
            }
          >
            {t('Preview recorded measurements', 'Gespeicherte Messwerte prüfen')}
          </Button>
          {replay && (
            <Paper sx={{ p: 2 }}>
              <Stack spacing={1}>
                {(replay.truncated || replay.transitionsTruncated) && (
                  <Alert severity="warning">
                    {t(
                      'Replay or transitions are truncated; shorten the window.',
                      'Wiedergabe oder Übergänge sind gekürzt; verkürzen Sie den Zeitraum.',
                    )}
                  </Alert>
                )}
                <Typography>
                  {t('Recorded alarm starts', 'Aufgezeichnete Alarmstarts')}: {replay.actualStarts}{' '}
                  · {t('Scenario starts / clears', 'Szenario-Starts / Rücksetzungen')}:{' '}
                  {replay.proposedStarts} / {replay.proposedClears}
                </Typography>
                <Typography>
                  {t(
                    'Readings / unusable / missing clocks / gaps',
                    'Messwerte / unbrauchbar / fehlende Zeiten / Lücken',
                  )}
                  : {replay.samples} / {replay.unusable} / {replay.missingClocks} / {replay.gaps}
                </Typography>
                <Typography>
                  {t(
                    'Missing signal identity / mapping changes',
                    'Fehlende Signalidentit\u00e4t / Zuordnungswechsel',
                  )}
                  : {replay.missingIdentity} / {replay.identityChanges}
                </Typography>
                <Typography>
                  {t('Current rule revision', 'Aktueller Regelstand')}:{' '}
                  {replay.ruleUpdatedAt
                    ? new Date(replay.ruleUpdatedAt).toLocaleString()
                    : t('Unknown', 'Unbekannt')}
                </Typography>
                {replay.transitions.map((transition, i) => (
                  <Typography key={i}>
                    {new Date(transition.at).toLocaleString()} ·{' '}
                    {transition.condition === 'active'
                      ? t('Active', 'Aktiv')
                      : t('Clear', 'Beendet')}
                  </Typography>
                ))}
              </Stack>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
