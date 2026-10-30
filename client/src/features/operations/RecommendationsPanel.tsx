import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useLanguage, useT } from '@/i18n';
import { operationRequest } from './api';

interface Recommendation {
  key: string;
  rule: string;
  title: string;
  detail: string;
  evidence: { revisionIds?: number[]; maintenanceActionId?: number };
  assumptions: string[];
  decision: {
    decision: 'accepted' | 'dismissed';
    reason: string | null;
    decidedAt: string;
    improvementAction: { id: number; title: string } | null;
    maintenanceActionId: number | null;
    maintenanceOutcome: string | null;
  } | null;
}
interface Usefulness {
  note: string;
  recommendations: { shown: number; accepted: number; dismissed: number };
  rankedLosses: { shown: number; actionsWithin7DaysOfViewing: number };
}

/**
 * X06: explicit, evidence-citing recommendations that people accept or dismiss.
 * @param root0
 * @param root0.machineId
 */
export default function RecommendationsPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    language = useLanguage((s) => s.language);
  const base = `/recommendations/machines/${machineId}`;
  const list = useQuery({
    queryKey: ['recommendations', machineId],
    queryFn: () => operationRequest<Recommendation[]>(base),
  });
  const usefulness = useQuery({
    queryKey: ['recommendation-usefulness', machineId],
    queryFn: () => operationRequest<Usefulness>(`${base}/usefulness`),
  });
  const improvements = useQuery({
    queryKey: ['improvement-actions', machineId],
    queryFn: () =>
      operationRequest<{ id: number; title: string }[]>(
        `/comparisons/machines/${machineId}/actions`,
      ),
  });
  const alarmActions = useQuery({
    queryKey: ['maintenance-actions', machineId],
    queryFn: () =>
      operationRequest<{ id: number; action: string; rule_name: string | null }[]>(
        `/maintenance-actions/machines/${machineId}`,
      ),
  });
  useEffect(() => {
    void operationRequest(`${base}/usefulness`, 'POST', { source: 'recommendations' }).catch(
      () => {},
    );
  }, [base]);
  const [reason, setReason] = useState<Record<string, string>>({}),
    [link, setLink] = useState<Record<string, string>>({}),
    [error, setError] = useState('');
  const decide = (key: string, body: Record<string, unknown>) => {
    setError('');
    void operationRequest(`${base}/decisions`, 'POST', { key, ...body })
      .then(() => Promise.all([list.refetch(), usefulness.refetch()]))
      .catch((e) => setError(String(e)));
  };
  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="h5">{t('Recommendations', 'Empfehlungen')}</Typography>
      <Alert severity="info">
        {t(
          'Three explicit rules over verified shift reports and alarm actions. Each names its evidence and assumptions. Accept one by linking the action you took, or dismiss it with a reason; the ranked loss list stays the reference.',
          'Drei ausdrückliche Regeln über verifizierte Schichtberichte und Alarmmaßnahmen. Jede nennt ihre Belege und Annahmen. Annehmen durch Verknüpfen der ergriffenen Maßnahme oder mit Begründung verwerfen; die sortierte Verlustliste bleibt die Referenz.',
        )}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {list.data && !list.data.length && (
        <Typography>
          {t(
            'No recommendation from the current evidence.',
            'Keine Empfehlung aus den aktuellen Belegen.',
          )}
        </Typography>
      )}
      {list.data?.map((r) => (
        <Box
          key={r.key}
          component="section"
          aria-label={r.title}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
        >
          <Typography variant="h6" component="h3">
            {r.title}
          </Typography>
          <Typography>{r.detail}</Typography>
          <Typography variant="body2">
            {t('Evidence', 'Belege')}:{' '}
            {r.evidence.revisionIds
              ? `${t('report revisions', 'Berichtsrevisionen')} ${r.evidence.revisionIds.join(', ')}`
              : `${t('alarm action', 'Alarmmaßnahme')} ${r.evidence.maintenanceActionId}`}
          </Typography>
          <Typography variant="body2">
            {t('Assumptions', 'Annahmen')}: {r.assumptions.join('; ')}
          </Typography>
          {r.decision ? (
            <Alert
              severity={r.decision.decision === 'accepted' ? 'success' : 'info'}
              sx={{ mt: 1 }}
            >
              {r.decision.decision === 'accepted'
                ? `${t('Accepted', 'Angenommen')}: ${
                    r.decision.improvementAction
                      ? `${t('improvement action', 'Verbesserungsmaßnahme')} “${r.decision.improvementAction.title}”`
                      : `${t('alarm action', 'Alarmmaßnahme')} ${r.decision.maintenanceActionId} (${r.decision.maintenanceOutcome ?? '–'})`
                  }`
                : `${t('Dismissed', 'Verworfen')}: ${r.decision.reason}`}{' '}
              · {new Date(r.decision.decidedAt).toLocaleString(language)}
            </Alert>
          ) : (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
              <TextField
                select
                size="small"
                label={`${t('Action taken for', 'Maßnahme zu')} ${r.title}`}
                value={link[r.key] ?? ''}
                onChange={(e) => setLink({ ...link, [r.key]: e.target.value })}
                sx={{ minWidth: 260 }}
              >
                {(improvements.data ?? []).map((a) => (
                  <MenuItem key={`i${a.id}`} value={`i${a.id}`}>
                    {t('Improvement', 'Verbesserung')}: {a.title}
                  </MenuItem>
                ))}
                {(alarmActions.data ?? []).map((a) => (
                  <MenuItem key={`m${a.id}`} value={`m${a.id}`}>
                    {t('Alarm action', 'Alarmmaßnahme')} {a.id}: {a.rule_name ?? a.action}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                disabled={!link[r.key]}
                onClick={() => {
                  const value = link[r.key];
                  decide(r.key, {
                    decision: 'accepted',
                    [value.startsWith('i') ? 'improvementActionId' : 'maintenanceActionId']: Number(
                      value.slice(1),
                    ),
                  });
                }}
              >
                {t('Accept', 'Annehmen')}
              </Button>
              <TextField
                size="small"
                label={`${t('Reason to dismiss', 'Grund zum Verwerfen')} ${r.title}`}
                value={reason[r.key] ?? ''}
                onChange={(e) => setReason({ ...reason, [r.key]: e.target.value })}
              />
              <Button
                disabled={(reason[r.key] ?? '').trim().length < 3}
                onClick={() =>
                  decide(r.key, { decision: 'dismissed', reason: reason[r.key].trim() })
                }
              >
                {t('Dismiss', 'Verwerfen')}
              </Button>
            </Stack>
          )}
        </Box>
      ))}
      {usefulness.data && (
        <Box>
          <Typography variant="h6">{t('Usefulness log', 'Nutzungsprotokoll')}</Typography>
          <Typography variant="body2">
            {t('Recommendations', 'Empfehlungen')}: {t('shown', 'angezeigt')}{' '}
            {usefulness.data.recommendations.shown}, {t('accepted', 'angenommen')}{' '}
            {usefulness.data.recommendations.accepted}, {t('dismissed', 'verworfen')}{' '}
            {usefulness.data.recommendations.dismissed} ·{' '}
            {t('Ranked loss list', 'Sortierte Verlustliste')}: {t('shown', 'angezeigt')}{' '}
            {usefulness.data.rankedLosses.shown},{' '}
            {t('improvement actions within 7 days', 'Verbesserungsmaßnahmen innerhalb von 7 Tagen')}{' '}
            {usefulness.data.rankedLosses.actionsWithin7DaysOfViewing}
          </Typography>
          <Typography variant="caption">{usefulness.data.note}</Typography>
        </Box>
      )}
    </Stack>
  );
}
