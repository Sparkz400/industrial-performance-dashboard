import React, { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { translate as t } from '@/i18n';
import { productionRequest } from './productionApi';
import { money } from '@/utils/insightFormat';

interface LossValueResult {
  product: string;
  currency: string | null;
  lines: { reason: string; seconds: number; lostParts: number | null; value: number | null }[];
  scrap: { parts: number | null; value: number | null };
  total: number | null;
  unpricedSeconds: number;
}

/**
 * The shift's stops and scrap in money, from the product values an administrator recorded.
 * @param root0
 * @param root0.shiftId
 */
export const ShiftLossValue: React.FC<{ shiftId: string }> = ({ shiftId }) => {
  const value = useQuery({
    queryKey: ['loss-value', shiftId],
    queryFn: () => productionRequest<LossValueResult[]>(`/shifts/${shiftId}/loss-value`),
  });
  if (!value.data) return null;
  return (
    <Box>
      <Typography variant="h6">{t('Losses in money')}</Typography>
      {value.data.map((part) => (
        <Box key={part.product} sx={{ mb: 1 }}>
          <Typography variant="subtitle2">
            {part.product || t('No product')}: {money(part.total, part.currency)}
          </Typography>
          {part.lines
            .filter((line) => line.value != null)
            .map((line) => (
              <Typography key={line.reason} variant="body2">
                {line.reason}: {money(line.value, part.currency)} ({line.lostParts?.toFixed(0)}{' '}
                {t('parts not made')})
              </Typography>
            ))}
          <Typography variant="body2">
            {t('Scrap')}: {money(part.scrap.value, part.currency)}
          </Typography>
          {part.currency == null && (
            <Alert severity="info">{t('No value is recorded for this product.')}</Alert>
          )}
        </Box>
      ))}
      <Typography variant="body2" color="text.secondary">
        {t(
          'Stop time at the ideal cycle times the unit value, plus rejects times the scrap cost. Planned and unknown time are not priced.',
        )}
      </Typography>
    </Box>
  );
};

/** Administrators record a product's unit value and scrap cost; each entry is kept as history. */
export const ProductValuesPanel: React.FC = () => {
  const values = useQuery({
    queryKey: ['product-values'],
    queryFn: () =>
      productionRequest<
        { id: number; product: string; currency: string; unitValue: number; scrapCost: number }[]
      >('/product-values'),
  });
  const [draft, setDraft] = useState({
    product: '',
    currency: 'EUR',
    unitValue: '',
    scrapCost: '',
    reference: '',
  });
  const [error, setError] = useState('');
  const latest = (values.data ?? []).filter(
    (v, i, all) => all.findIndex((other) => other.product === v.product) === i,
  );
  const field = (key: keyof typeof draft, label: string) => (
    <TextField
      label={t(label)}
      // eslint-disable-next-line security/detect-object-injection -- key is a fixed field name of draft
      value={draft[key]}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
    />
  );
  return (
    <Paper sx={{ p: 2 }} data-print-hide>
      <Typography variant="h6">{t('Product values')}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {latest.map((v) => (
        <Typography key={v.id} variant="body2">
          {v.product}: {money(v.unitValue, v.currency)} {t('per part')} · {t('Scrap')}{' '}
          {money(v.scrapCost, v.currency)}
        </Typography>
      ))}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 2 }}>
        {field('product', 'Product to value')}
        {field('currency', 'Currency')}
        {field('unitValue', 'Unit value')}
        {field('scrapCost', 'Scrap cost per part')}
        {field('reference', 'Source of the values')}
        <Button
          variant="contained"
          disabled={!draft.product.trim() || !draft.reference.trim()}
          onClick={async () => {
            setError('');
            try {
              await productionRequest('/product-values', {
                ...draft,
                unitValue: Number(draft.unitValue),
                scrapCost: Number(draft.scrapCost),
              });
              setDraft((d) => ({ ...d, product: '', unitValue: '', scrapCost: '' }));
              await values.refetch();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          {t('Save value')}
        </Button>
      </Stack>
    </Paper>
  );
};
