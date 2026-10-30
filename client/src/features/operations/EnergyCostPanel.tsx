import React, { useEffect, useState } from 'react';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useLanguage, useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { operationRequest, toIso } from './api';
import { downloadJson } from '../production/CommissioningPanel';
interface Tariff {
  id: number;
  version: number;
  valid_from: string;
  valid_to: string;
  currency: string;
  price_per_kwh: number;
  kg_co2e_per_kwh: number | null;
  reference: string;
}
interface Estimate {
  configured: boolean;
  estimatedCost: number | null;
  currency: string | null;
  estimatedKgCo2e: number | null;
  observedCosts: Record<string, number>;
  observedKgCo2e: number | null;
  costComplete: boolean;
  emissionsComplete: boolean;
  coveredSeconds: number;
  pricedSeconds: number;
  emissionSeconds: number;
  correctedSampleCount: number;
  inputDigest: string;
  meterVersion: number;
  tariffs: Tariff[];
}
/**
 * Keep observed amounts separate from complete cost and emissions estimates.
 * @param root0 Estimate scope.
 * @param root0.machineId Assigned machine with tariff periods.
 * @param root0.shiftId Selected shift to estimate.
 */
export default function EnergyCostPanel({
  machineId,
  shiftId,
}: {
  machineId: number;
  shiftId: string;
}) {
  const t = useT(),
    language = useLanguage((s) => s.language),
    user = useAuthStore((s) => s.user),
    edit = !user?.recoveryMode && ['admin', 'supervisor'].includes(user?.role ?? '');
  const [draft, setDraft] = useState({
      validFrom: '',
      validTo: '',
      currency: 'EUR',
      price: '',
      factor: '',
      reference: '',
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft({ validFrom: '', validTo: '', currency: 'EUR', price: '', factor: '', reference: '' });
    setError('');
  }, [machineId]);
  const tariffs = useQuery({
    queryKey: ['energy-tariffs', machineId],
    queryFn: () => operationRequest<Tariff[]>(`/energy-costs/machines/${machineId}/tariffs`),
  });
  const estimate = useQuery({
    queryKey: ['energy-costs', machineId, shiftId, tariffs.data?.length],
    queryFn: () => operationRequest<Estimate>(`/energy-costs/shifts/${shiftId}`),
    enabled: !!shiftId,
  });
  const value = (v: number | null | undefined) =>
    v == null ? t('Unknown') : v.toLocaleString(language, { maximumFractionDigits: 6 });
  return (
    <Paper sx={{ p: 2, minWidth: 0 }}>
      <Stack spacing={2}>
        <Typography variant="h6">
          {t('Energy cost and emissions estimates', 'Energiekosten- und Emissionsschätzungen')}
        </Typography>
        <Alert severity="info">
          {t(
            'Estimates use your price and emissions factors. Missing readings or factors remain unknown. Meter intervals crossing a tariff boundary are not allocated. Taxes, fixed charges and currency conversion are excluded; these are not billing or certified emissions records.',
            'Schätzungen verwenden Ihre Preis- und Emissionsfaktoren. Fehlende Messungen oder Faktoren bleiben unbekannt. Messintervalle über Tarifgrenzen werden nicht zugeordnet. Steuern, Grundpreise und Währungsumrechnung sind ausgeschlossen; keine Abrechnungs- oder zertifizierten Emissionsnachweise.',
          )}
        </Alert>
        {(error || tariffs.error || estimate.error) && (
          <Alert severity="error">{error || String(tariffs.error || estimate.error)}</Alert>
        )}
        {edit && (
          <Stack spacing={2}>
            <Typography>
              {t(
                'Add an immutable tariff period. Existing periods cannot overlap or be overwritten. Times use this browser’s local timezone.',
                'Unveränderlichen Tarifzeitraum ergänzen. Vorhandene Zeiträume dürfen sich nicht überschneiden oder überschrieben werden. Zeiten verwenden die lokale Browser-Zeitzone.',
              )}
            </Typography>
            <TextField
              type="datetime-local"
              label={t('Tariff valid from', 'Tarif gültig ab')}
              value={draft.validFrom}
              onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
              slotProps={{
                inputLabel: { shrink: true },
              }}
            />
            <TextField
              type="datetime-local"
              label={t('Tariff valid until', 'Tarif gültig bis')}
              value={draft.validTo}
              onChange={(e) => setDraft({ ...draft, validTo: e.target.value })}
              slotProps={{
                inputLabel: { shrink: true },
              }}
            />
            <TextField
              label={t('Currency code', 'Währungscode')}
              value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
              slotProps={{
                htmlInput: { maxLength: 3 },
              }}
            />
            <TextField
              type="number"
              label={t('Price per kWh', 'Preis je kWh')}
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
            <TextField
              type="number"
              label={t('kg CO₂e per kWh (optional)', 'kg CO₂e je kWh (optional)')}
              value={draft.factor}
              onChange={(e) => setDraft({ ...draft, factor: e.target.value })}
            />
            <TextField
              label={t('Tariff and factor reference', 'Tarif- und Faktorreferenz')}
              value={draft.reference}
              onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
            />
            <Button
              disabled={
                busy ||
                !draft.validFrom ||
                !draft.validTo ||
                draft.price === '' ||
                !draft.reference.trim()
              }
              onClick={() => {
                setBusy(true);
                setError('');
                void operationRequest(`/energy-costs/machines/${machineId}/tariffs`, 'POST', {
                  version: Math.max(0, ...(tariffs.data ?? []).map((v) => v.version)),
                  validFrom: toIso(draft.validFrom),
                  validTo: toIso(draft.validTo),
                  currency: draft.currency,
                  pricePerKWh: Number(draft.price),
                  kgCo2ePerKWh: draft.factor === '' ? null : Number(draft.factor),
                  reference: draft.reference,
                })
                  .then(async () => {
                    await tariffs.refetch();
                    if (shiftId) await estimate.refetch();
                  })
                  .catch((e) => setError(String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('Preserve tariff period', 'Tarifzeitraum bewahren')}
            </Button>
          </Stack>
        )}
        {tariffs.data?.map((rate) => (
          <Typography key={rate.id} sx={{ overflowWrap: 'anywhere' }}>
            v{rate.version} · {new Date(rate.valid_from).toLocaleString(language)} –{' '}
            {new Date(rate.valid_to).toLocaleString(language)} · {value(rate.price_per_kwh)}{' '}
            {rate.currency}/kWh · {value(rate.kg_co2e_per_kwh)} kg CO₂e/kWh · {rate.reference}
          </Typography>
        ))}
        {!shiftId && (
          <Typography>
            {t(
              'Select a shift above to estimate its energy cost.',
              'Oben eine Schicht zur Energiekostenschätzung wählen.',
            )}
          </Typography>
        )}
        {estimate.isFetching && <Typography role="status">{t('Loading…')}</Typography>}
        {estimate.data?.configured && (
          <Stack spacing={1}>
            {(!estimate.data.costComplete || !estimate.data.emissionsComplete) && (
              <Alert severity="warning">
                {t(
                  'Incomplete measurements or factors: a full-shift estimate is unknown. Observed portions are shown separately.',
                  'Unvollständige Messungen oder Faktoren: Eine vollständige Schichtschätzung ist unbekannt. Beobachtete Anteile werden getrennt angezeigt.',
                )}
              </Alert>
            )}
            <Typography>
              {t('Estimated shift cost', 'Geschätzte Schichtkosten')}:{' '}
              {value(estimate.data.estimatedCost)} {estimate.data.currency ?? ''}
            </Typography>
            <Typography>
              {t('Estimated shift emissions', 'Geschätzte Schichtemissionen')}:{' '}
              {value(estimate.data.estimatedKgCo2e)} kg CO₂e
            </Typography>
            <Typography>
              {t('Observed priced portions', 'Beobachtete bepreiste Anteile')}:{' '}
              {Object.entries(estimate.data.observedCosts)
                .map(([currency, cost]) => `${value(cost)} ${currency}`)
                .join(' · ') || t('Unknown')}
            </Typography>
            <Typography>
              {t('Observed emissions portion', 'Beobachteter Emissionsanteil')}:{' '}
              {value(estimate.data.observedKgCo2e)} kg CO₂e
            </Typography>
            <Typography>
              {t('Priced / measured seconds', 'Bepreiste / gemessene Sekunden')}:{' '}
              {estimate.data.pricedSeconds} / {estimate.data.coveredSeconds} ·{' '}
              {t('Corrected samples', 'Korrigierte Messwerte')}:{' '}
              {estimate.data.correctedSampleCount}
            </Typography>
            <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
              {t('Input evidence digest', 'Eingangsnachweis-Prüfsumme')}:{' '}
              {estimate.data.inputDigest}
            </Typography>
            <Button onClick={() => downloadJson(estimate.data, 'energy-cost-estimate.json')}>
              {t('Export estimate and factors', 'Schätzung und Faktoren exportieren')}
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
