import React, { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/useAuthStore';
import { formatNumber, useT } from '@/i18n';
import { operationRequest } from './api';
import type { ProductionSignal } from '@performance-dashboard/shared';
import EnergyCostPanel from './EnergyCostPanel';
interface Meter {
  signal: ProductionSignal;
  maxGapSeconds: number;
  modulus: number | null;
}
interface Analysis {
  configured: boolean;
  observedKWh: number | null;
  idleKWh: number | null;
  unassignedKWh: number | null;
  kWhPerGoodPart: number | null;
  complete: boolean;
  coveredSeconds: number;
  goodParts: number | null;
  changeoverSeconds: number;
  unknownStateSeconds: number;
  losses: { reason: string; seconds: number }[];
  independent: { kWh: number; toleranceKWh: number; reference: string; createdBy: number } | null;
  differenceKWh: number | null;
  reconciled: boolean;
}
const initial: Meter = {
  signal: {
    nodeKey: 'Energy',
    namespaceUri: '',
    identifier: '',
    dataType: 'Double',
    unit: 'kWh',
    scale: 1,
  },
  maxGapSeconds: 60,
  modulus: null,
};
/**
 *
 * @param root0
 * @param root0.machineId
 */
export default function EnergyPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    user = useAuthStore((s) => s.user),
    role = user?.role,
    edit = !user?.recoveryMode && (role === 'admin' || role === 'supervisor');
  const [draft, setDraft] = useState<Meter | null>(null),
    [shift, setShift] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [evidence, setEvidence] = useState({ kWh: '', toleranceKWh: '0', reference: '' });
  useEffect(() => {
    setShift('');
    setDraft(null);
    setError('');
    setMessage('');
  }, [machineId]);
  const meter = useQuery({
    queryKey: ['energy-meter', machineId],
    queryFn: () =>
      operationRequest<{ config: Meter; version: number } | null>(`/energy/machines/${machineId}`),
  });
  const shifts = useQuery({
    queryKey: ['production-shifts'],
    queryFn: () =>
      operationRequest<{ id: number; name: string; machineId: number }[]>('/production/shifts'),
  });
  const analysis = useQuery({
    queryKey: ['energy-analysis', shift, meter.data?.version],
    queryFn: () => operationRequest<Analysis>(`/energy/shifts/${shift}`),
    enabled: !!shift,
  });
  const config = draft ?? meter.data?.config ?? initial;
  const signal = (patch: Partial<ProductionSignal>) =>
    setDraft({ ...config, signal: { ...config.signal, ...patch } });
  const number = (value: number | null | undefined) => formatNumber(value, 4);
  return (
    <Stack spacing={3}>
      <Typography variant="h5">{t('Energy and losses')}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert role="status" severity="success">
          {message}
        </Alert>
      )}
      {meter.error && <Alert severity="error">{String(meter.error)}</Alert>}
      <Alert severity="info">
        {t(
          'Use a cumulative energy meter. Source identity, units and scale must match the machine. Gaps and undeclared resets stay unknown; energy crossing a state change remains unassigned.',
          'Einen kumulativen Energiezähler verwenden. Herkunft, Einheit und Skalierung müssen zur Maschine passen. Lücken und nicht erklärte Rücksetzungen bleiben unbekannt; Energie über Zustandswechsel bleibt unzugeordnet.',
        )}
      </Alert>
      {edit && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h6">{t('Meter setup', 'Zählerkonfiguration')}</Typography>
            {[
              ['nodeKey', config.signal.nodeKey, 'Energy signal key', 'Energie-Signalschlüssel'],
              [
                'namespaceUri',
                config.signal.namespaceUri,
                'Source namespace URI',
                'Namensraum-URI der Quelle',
              ],
              ['identifier', config.signal.identifier, 'Source identifier', 'Kennung der Quelle'],
            ].map(([key, value, english, german]) => (
              <TextField
                key={key}
                label={t(english, german)}
                value={value}
                onChange={(e) => signal({ [key]: e.target.value })}
              />
            ))}
            <TextField
              select
              label={t('Meter data type', 'Datentyp des Zählers')}
              value={config.signal.dataType}
              onChange={(e) => signal({ dataType: e.target.value })}
            >
              {['Byte', 'UInt16', 'UInt32', 'Int32', 'Float', 'Double'].map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t('Energy unit', 'Energieeinheit')}
              value={config.signal.unit ?? 'kWh'}
              onChange={(e) => signal({ unit: e.target.value })}
            >
              {['kWh', 'Wh'].map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="number"
              label={t('Meter scale', 'Zählerskalierung')}
              value={config.signal.scale}
              onChange={(e) => signal({ scale: Number(e.target.value) })}
            />
            <TextField
              type="number"
              label={t('Maximum gap in seconds', 'Maximale Lücke in Sekunden')}
              value={config.maxGapSeconds}
              onChange={(e) => setDraft({ ...config, maxGapSeconds: Number(e.target.value) })}
            />
            <TextField
              type="number"
              label={t('Rollover modulus (optional)', 'Überlaufmodulus (optional)')}
              value={config.modulus ?? ''}
              onChange={(e) =>
                setDraft({
                  ...config,
                  modulus: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
            <Button
              disabled={busy || meter.isLoading}
              onClick={() => {
                setBusy(true);
                setError('');
                setMessage('');
                void operationRequest(`/energy/machines/${machineId}`, 'PUT', {
                  version: meter.data?.version ?? 0,
                  config,
                })
                  .then(async () => {
                    await meter.refetch();
                    setDraft(null);
                    setMessage(t('Meter saved.', 'Zähler gespeichert.'));
                  })
                  .catch((e) => setError(String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('Save meter', 'Zähler speichern')}
            </Button>
          </Stack>
        </Paper>
      )}
      <TextField select label={t('Shift')} value={shift} onChange={(e) => setShift(e.target.value)}>
        {shifts.data
          ?.filter((s) => s.machineId === machineId)
          .map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
      </TextField>
      {analysis.error && <Alert severity="error">{String(analysis.error)}</Alert>}
      {analysis.isFetching && <Typography role="status">{t('Loading…')}</Typography>}
      {analysis.data && !analysis.data.configured && (
        <Alert severity="info">
          {t('No energy meter configured.', 'Kein Energiezähler konfiguriert.')}
        </Alert>
      )}
      {analysis.data?.configured && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            {!analysis.data.complete && (
              <Alert severity="warning">
                {t(
                  'Partial measurements: totals are observed values, not a complete shift total.',
                  'Unvollständige Messungen: Summen sind beobachtete Werte, keine vollständige Schichtsumme.',
                )}
              </Alert>
            )}
            <Typography variant="h6">
              {t('Observed energy', 'Beobachtete Energie')}: {number(analysis.data.observedKWh)} kWh
            </Typography>
            <Typography>
              {t('Energy per good part', 'Energie je Gutteil')}:{' '}
              {number(analysis.data.kWhPerGoodPart)} kWh
            </Typography>
            <Typography>
              {t('Idle energy', 'Energie im Leerlauf')}: {number(analysis.data.idleKWh)} kWh ·{' '}
              {t('Unassigned energy', 'Nicht zugeordnete Energie')}:{' '}
              {number(analysis.data.unassignedKWh)} kWh
            </Typography>
            <Typography>
              {t('Confirmed changeover time', 'Bestätigte Rüstzeit')}:{' '}
              {number(analysis.data.changeoverSeconds / 60)} min
            </Typography>
            <Typography>
              {t('Unknown state time', 'Zeit mit unbekanntem Zustand')}:{' '}
              {number(analysis.data.unknownStateSeconds / 60)} min
            </Typography>
            <Typography variant="h6">
              {t('Largest measured losses', 'Größte gemessene Verluste')}
            </Typography>
            {analysis.data.losses.map((loss) => (
              <Typography key={loss.reason}>
                {loss.reason}: {number(loss.seconds / 60)} min
              </Typography>
            ))}
            <Typography variant="h6">
              {t('Independent meter reconciliation', 'Unabhängiger Zählerabgleich')}
            </Typography>
            {analysis.data.independent ? (
              <Alert severity={analysis.data.reconciled ? 'success' : 'warning'}>
                {analysis.data.reconciled
                  ? t(
                      'Matches the recorded independent meter evidence.',
                      'Stimmt mit dem erfassten unabhängigen Zählernachweis überein.',
                    )
                  : t(
                      'Not reconciled: incomplete data or a difference outside the declared tolerance.',
                      'Nicht abgeglichen: unvollständige Daten oder Abweichung außerhalb der angegebenen Toleranz.',
                    )}{' '}
                {analysis.data.independent.reference} · {number(analysis.data.independent.kWh)} kWh
                · {t('Difference', 'Abweichung')}: {number(analysis.data.differenceKWh)} kWh
              </Alert>
            ) : (
              edit && (
                <Stack spacing={2}>
                  <Typography>
                    {t(
                      'Record an independently read meter total for this ended shift. Saved evidence cannot be overwritten.',
                      'Einen unabhängig abgelesenen Zählerverbrauch für diese abgeschlossene Schicht erfassen. Gespeicherte Nachweise können nicht überschrieben werden.',
                    )}
                  </Typography>
                  <TextField
                    type="number"
                    label={t('Independent energy (kWh)', 'Unabhängige Energiemenge (kWh)')}
                    value={evidence.kWh}
                    onChange={(e) => setEvidence((v) => ({ ...v, kWh: e.target.value }))}
                  />
                  <TextField
                    type="number"
                    label={t('Declared tolerance (kWh)', 'Angegebene Toleranz (kWh)')}
                    value={evidence.toleranceKWh}
                    onChange={(e) => setEvidence((v) => ({ ...v, toleranceKWh: e.target.value }))}
                  />
                  <TextField
                    label={t('Evidence reference', 'Nachweisreferenz')}
                    value={evidence.reference}
                    onChange={(e) => setEvidence((v) => ({ ...v, reference: e.target.value }))}
                  />
                  <Button
                    disabled={busy || evidence.kWh === '' || !evidence.reference.trim()}
                    onClick={() => {
                      setBusy(true);
                      setError('');
                      void operationRequest(`/energy/shifts/${shift}/reconcile`, 'POST', {
                        kWh: Number(evidence.kWh),
                        toleranceKWh: Number(evidence.toleranceKWh),
                        reference: evidence.reference,
                      })
                        .then(async () => {
                          await analysis.refetch();
                          setEvidence({ kWh: '', toleranceKWh: '0', reference: '' });
                        })
                        .catch((e) => setError(String(e)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t('Preserve meter evidence', 'Zählernachweis bewahren')}
                  </Button>
                </Stack>
              )
            )}
          </Stack>
        </Paper>
      )}
      <EnergyCostPanel key={machineId} machineId={machineId} shiftId={shift} />
    </Stack>
  );
}
