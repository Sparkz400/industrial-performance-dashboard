import React, { useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type {
  ComparisonPeriod,
  ComparisonReason,
  PeriodComparison,
} from '@performance-dashboard/shared';
import { useLanguage, useT } from '@/i18n';
import { operationRequest } from './api';
import { downloadJson } from '../production/CommissioningPanel';

interface Shift {
  id: number;
  name: string;
  machineId: number;
  start: string;
  end: string;
}
interface Revision {
  id: number;
  createdAt: string;
  createdBy: number;
}

/**
 * Compare preserved shift evidence without replacing earlier reports with current calculations.
 * @param root0
 * @param root0.machineId
 */
export default function ComparisonPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    language = useLanguage((s) => s.language);
  const [beforeShift, setBeforeShift] = useState(''),
    [afterShift, setAfterShift] = useState('');
  const [beforeRevision, setBeforeRevision] = useState(''),
    [afterRevision, setAfterRevision] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const shifts = useQuery({
    queryKey: ['production-shifts'],
    queryFn: () => operationRequest<Shift[]>('/production/shifts'),
  });
  const before = useQuery({
    queryKey: ['shift-revisions', beforeShift],
    enabled: !!beforeShift,
    queryFn: () => operationRequest<Revision[]>(`/planning/shifts/${beforeShift}/revisions`),
  });
  const after = useQuery({
    queryKey: ['shift-revisions', afterShift],
    enabled: !!afterShift,
    queryFn: () => operationRequest<Revision[]>(`/planning/shifts/${afterShift}/revisions`),
  });
  const comparison = useQuery({
    queryKey: ['period-comparison', machineId, beforeRevision, afterRevision],
    enabled: !!beforeRevision && !!afterRevision,
    queryFn: () =>
      operationRequest<PeriodComparison>(
        `/comparisons/machines/${machineId}?before=${beforeRevision}&after=${afterRevision}`,
      ),
  });
  const available =
    shifts.data?.filter((s) => s.machineId === machineId && Date.parse(s.end) <= Date.now()) ?? [];
  const number = (value: number | null) =>
    value == null ? t('Unknown') : value.toLocaleString(language, { maximumFractionDigits: 3 });
  const date = (value: string) => new Date(value).toLocaleString(language);
  const reasons = new Map(
    Object.entries({
      unverified: t(
        'Both reports must be reconciled and free of unresolved evidence issues.',
        'Beide Berichte müssen abgeglichen und ohne offene Nachweisprobleme sein.',
      ),
      coverage: t('State coverage is incomplete.', 'Die Zustandserfassung ist unvollständig.'),
      schedule: t(
        'Scheduled or excluded time differs, or no production time is scheduled.',
        'Geplante oder ausgeschlossene Zeit weicht ab oder es ist keine Produktionszeit geplant.',
      ),
      duration: t('Period lengths differ.', 'Die Zeiträume sind unterschiedlich lang.'),
      definitions: t(
        'Signal, counter or state definitions differ.',
        'Signal-, Zähler- oder Zustandsdefinitionen weichen ab.',
      ),
      'product-mix': t(
        'Product mix, cycle standards or assigned production time differs.',
        'Produktmix, Sollzykluszeiten oder zugeordnete Produktionszeit weichen ab.',
      ),
      unfinished: t(
        'A report was saved before its shift ended.',
        'Ein Bericht wurde vor Schichtende gespeichert.',
      ),
      'energy-unavailable': t(
        'Complete frozen energy per good part is unavailable.',
        'Vollständige gespeicherte Energie je Gutteil ist nicht verfügbar.',
      ),
      'energy-definition': t(
        'Energy meter definitions differ.',
        'Die Energiezählerdefinitionen weichen ab.',
      ),
    }),
  );
  const reason = (code: ComparisonReason) => reasons.get(code);
  const labels: Record<PeriodComparison['metrics'][number]['key'], string> = {
    goodPerHour: t('Good parts per scheduled hour', 'Gutteile je geplanter Stunde'),
    availability: t('Availability', 'Verfügbarkeit'),
    quality: t('Quality', 'Qualität'),
    oee: 'OEE',
    idleFaultSeconds: t('Observed idle and fault time', 'Beobachtete Stillstands- und Störzeit'),
    kWhPerGoodPart: t('Energy per good part', 'Energie je Gutteil'),
  };
  const renderPeriod = (period: ComparisonPeriod, title: string) => (
    <Paper sx={{ p: 2, minWidth: 0, flex: 1 }}>
      <Stack spacing={1}>
        <Typography variant="h6">
          {title}: {period.report.name}
        </Typography>
        <Typography>
          {date(period.report.start)} – {date(period.report.end)}
        </Typography>
        <Typography>
          {t('Shift timezone', 'Schichtzeitzone')}: {period.report.timezone} ·{' '}
          {t('Dates use your browser timezone.', 'Datumsangaben verwenden die Browser-Zeitzone.')}
        </Typography>
        <Typography>
          {t('Report revision', 'Berichtsversion')} #{period.revisionId} · {date(period.savedAt)} ·{' '}
          {t('Saved by user', 'Gespeichert von Benutzer')} #{period.savedBy}
        </Typography>
        {period.latestRevisionId !== period.revisionId && (
          <Alert severity="info">
            {t(
              'A newer report revision exists. This comparison keeps the selected evidence.',
              'Eine neuere Berichtsversion ist vorhanden. Dieser Vergleich behält die ausgewählten Nachweise bei.',
            )}
          </Alert>
        )}
        <Typography>
          {t(
            'Scheduled / excluded / unknown seconds',
            'Geplante / ausgeschlossene / unbekannte Sekunden',
          )}
          : {number(period.report.scheduledSeconds)} / {number(period.report.plannedSeconds)} /{' '}
          {number(period.report.seconds.unknown)}
        </Typography>
        <Typography>
          {t('Observed seconds', 'Beobachtete Sekunden')}: {number(period.report.observedSeconds)}
        </Typography>
        <Typography>
          {t('Total / good / reject', 'Gesamt / gut / Ausschuss')}:{' '}
          {number(period.report.quantities.total)} / {number(period.report.quantities.good)} /{' '}
          {number(period.report.quantities.reject)}
        </Typography>
        <Typography>
          {t('Product mix by scheduled time', 'Produktmix nach geplanter Zeit')}
        </Typography>
        {period.productMix.map((p) => (
          <Typography key={`${p.product}:${p.idealCycleMs}`}>
            {p.product} · {number(p.scheduledSeconds)} s · {number(p.idealCycleMs)} ms/
            {t('cycle', 'Zyklus')}
          </Typography>
        ))}
        <Typography>
          {t('Unassigned scheduled seconds', 'Nicht zugeordnete geplante Sekunden')}:{' '}
          {number(period.unassignedScheduledSeconds)}
        </Typography>
        <Typography>
          {t('Plan version', 'Planversion')}: {period.report.planVersion ?? t('Unknown')} ·{' '}
          {t('Downtime corrections', 'Stillstandskorrekturen')}:{' '}
          {period.report.reasons.filter((r) => r.supersedesId != null).length}
        </Typography>
        {period.report.reasons
          .filter((r) => r.supersedesId != null)
          .map((r) => (
            <Typography key={r.id}>
              #{r.id} ← #{r.supersedesId} · {r.reason} · {t('User', 'Benutzer')} #{r.actorId} ·{' '}
              {date(r.createdAt)}
            </Typography>
          ))}
        {period.report.evidence && (
          <Typography>
            {t('Independent count reference', 'Unabhängige Zählreferenz')}:{' '}
            {period.report.evidence.reference} · {t('User', 'Benutzer')} #
            {period.report.evidence.actorId}
          </Typography>
        )}
        {period.report.issues.map((issue, i) => (
          <Alert key={i} severity="warning">
            {issue}
          </Alert>
        ))}
        <Button
          onClick={async () => {
            setDownloadError('');
            try {
              downloadJson(
                await operationRequest(
                  `/planning/shifts/${period.report.id}/revisions/${period.revisionId}`,
                ),
                `shift-${period.report.id}-revision-${period.revisionId}.json`,
              );
            } catch (error) {
              setDownloadError(String(error));
            }
          }}
        >
          {t('Download selected evidence', 'Ausgewählte Nachweise herunterladen')}
        </Button>
      </Stack>
    </Paper>
  );
  return (
    <Stack spacing={3} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="h5">{t('Period comparison', 'Zeitraumvergleich')}</Typography>
      {downloadError && <Alert severity="error">{downloadError}</Alert>}
      <Alert severity="info">
        {t(
          'Compare two saved revisions of ended shifts on this machine. Save revisions in Planning first. Differences describe observations and do not prove that an intervention caused an improvement.',
          'Zwei gespeicherte Versionen beendeter Schichten dieser Maschine vergleichen. Versionen zunächst in der Planung speichern. Unterschiede beschreiben Beobachtungen und beweisen nicht, dass ein Eingriff eine Verbesserung verursacht hat.',
        )}
      </Alert>
      {[shifts.error, before.error, after.error, comparison.error]
        .filter(Boolean)
        .map((error, i) => (
          <Alert severity="error" key={i}>
            {String(error)}
          </Alert>
        ))}
      {shifts.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
      {!shifts.isLoading && available.length === 0 && (
        <Alert severity="info">
          {t(
            'No ended shifts are available for this machine.',
            'Für diese Maschine sind keine beendeten Schichten vorhanden.',
          )}
        </Alert>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {[
          {
            title: t('Before', 'Vorher'),
            shift: beforeShift,
            setShift: setBeforeShift,
            revision: beforeRevision,
            setRevision: setBeforeRevision,
            query: before,
          },
          {
            title: t('After', 'Nachher'),
            shift: afterShift,
            setShift: setAfterShift,
            revision: afterRevision,
            setRevision: setAfterRevision,
            query: after,
          },
        ].map((choice) => (
          <Stack spacing={2} key={choice.title} sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              select
              label={`${choice.title} — ${t('Shift', 'Schicht')}`}
              value={choice.shift}
              onChange={(e) => {
                choice.setShift(e.target.value);
                choice.setRevision('');
              }}
            >
              {available.map((shift) => (
                <MenuItem key={shift.id} value={shift.id}>
                  {shift.name} · {date(shift.start)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={`${choice.title} — ${t('Report revision', 'Berichtsversion')}`}
              value={choice.revision}
              disabled={!choice.shift || choice.query.isLoading}
              onChange={(e) => choice.setRevision(e.target.value)}
            >
              {choice.query.data?.map((revision) => (
                <MenuItem key={revision.id} value={revision.id}>
                  #{revision.id} · {date(revision.createdAt)}
                </MenuItem>
              ))}
            </TextField>
            {choice.shift && choice.query.data?.length === 0 && (
              <Alert severity="info">
                {t(
                  'Save a report revision in Planning before comparing this shift.',
                  'Vor dem Vergleich eine Berichtsversion dieser Schicht in der Planung speichern.',
                )}
              </Alert>
            )}
          </Stack>
        ))}
      </Stack>
      {comparison.isFetching && (
        <Typography role="status">
          {t('Comparing evidence…', 'Nachweise werden verglichen…')}
        </Typography>
      )}
      {comparison.data && (
        <>
          <Alert severity={comparison.data.comparable ? 'info' : 'warning'}>
            {comparison.data.comparable
              ? t(
                  'Comparable recorded conditions. Changes are after minus before; percentage metrics use percentage points.',
                  'Vergleichbare dokumentierte Bedingungen. Änderungen sind Nachher minus Vorher; Prozentwerte verwenden Prozentpunkte.',
                )
              : t(
                  'Conditions are not comparable. Values remain visible; change calculations are withheld.',
                  'Die Bedingungen sind nicht vergleichbar. Werte bleiben sichtbar; Änderungen werden nicht berechnet.',
                )}
          </Alert>
          {comparison.data.reasons.map((code) => (
            <Typography key={code}>{reason(code)}</Typography>
          ))}
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
            {renderPeriod(comparison.data.before, t('Before', 'Vorher'))}
            {renderPeriod(comparison.data.after, t('After', 'Nachher'))}
          </Stack>
          {comparison.data.metrics.map((metric) => (
            <Paper key={metric.key} sx={{ p: 2 }}>
              <Typography variant="h6">{labels[metric.key]}</Typography>
              <Typography>
                {t('Before', 'Vorher')}: {number(metric.before)} · {t('After', 'Nachher')}:{' '}
                {number(metric.after)} ({metric.unit})
              </Typography>
              <Typography>
                {t('Change', 'Änderung')}:{' '}
                {metric.delta == null
                  ? t('Not calculated', 'Nicht berechnet')
                  : `${number(metric.delta)} ${metric.unit === '%' ? t('percentage points', 'Prozentpunkte') : metric.unit}`}
              </Typography>
              {metric.reasons
                .filter((code) => code.startsWith('energy'))
                .map((code) => (
                  <Typography key={code}>{reason(code)}</Typography>
                ))}
            </Paper>
          ))}
          <Paper sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography variant="h6">
                {t(
                  'Recorded services between periods',
                  'Dokumentierte Wartungen zwischen den Zeiträumen',
                )}
              </Typography>
              <Typography>
                {t(
                  'These are current service records, separate from the frozen reports. Timing alone does not establish causation.',
                  'Dies sind aktuelle Wartungsaufzeichnungen, getrennt von den gespeicherten Berichten. Der Zeitpunkt allein belegt keine Ursache.',
                )}
              </Typography>
              {comparison.data.interventions.length === 0 && (
                <Typography>
                  {t(
                    'No completed services were recorded in this interval. This does not prove that no intervention occurred.',
                    'In diesem Intervall wurden keine abgeschlossenen Wartungen dokumentiert. Dies beweist nicht, dass kein Eingriff stattgefunden hat.',
                  )}
                </Typography>
              )}
              {comparison.data.interventions.map((event) => (
                <Typography key={event.id}>
                  #{event.id} · {date(event.createdAt)} · {t('User', 'Benutzer')} #{event.createdBy}{' '}
                  · {event.note}
                </Typography>
              ))}
              {comparison.data.interventionsTruncated && (
                <Alert severity="warning">
                  {t(
                    'Only the first 100 service records are shown.',
                    'Es werden nur die ersten 100 Wartungsaufzeichnungen angezeigt.',
                  )}
                </Alert>
              )}
            </Stack>
          </Paper>
          <Button
            onClick={() =>
              downloadJson(comparison.data, `comparison-${beforeRevision}-${afterRevision}.json`)
            }
          >
            {t('Download comparison', 'Vergleich herunterladen')}
          </Button>
        </>
      )}
    </Stack>
  );
}
