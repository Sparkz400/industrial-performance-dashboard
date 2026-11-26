import React, { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { translate as t } from '@/i18n';
import { API_BASE_URL } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';
import { productionRequest } from './productionApi';
import { useReasonCodes, type ReasonCode } from './reasonCodes';

interface PickerProps {
  category: string;
  reason: string;
  onChange: (value: { reason: string; codeId: number | null }) => void;
}

/**
 * Pick a listed reason (one spelling, so the loss ranking groups it) or type free text.
 * @param root0
 * @param root0.category
 * @param root0.reason
 * @param root0.onChange
 */
export const ReasonPicker: React.FC<PickerProps> = ({ category, reason, onChange }) => {
  const codes = (useReasonCodes().data ?? []).filter((c) => c.active && c.category === category);
  return (
    <Autocomplete
      freeSolo
      options={codes.map((c) => c.label)}
      inputValue={reason}
      onInputChange={(_event, text) =>
        onChange({ reason: text, codeId: codes.find((c) => c.label === text)?.id ?? null })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={t('Reason / correction explanation')}
          helperText={codes.length ? t('Pick a listed reason or describe the stop') : undefined}
        />
      )}
    />
  );
};

/**
 * Administrators add and retire listed reasons. Codes are never renamed or deleted, so
 * recorded stops keep the label they were given.
 */
export const ReasonCatalogPanel: React.FC = () => {
  const codes = useReasonCodes();
  const [draft, setDraft] = useState({ category: 'unplanned', label: '' });
  const [error, setError] = useState('');
  const run = async (work: () => Promise<unknown>) => {
    setError('');
    try {
      await work();
      await codes.refetch();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const setActive = (code: ReasonCode) =>
    run(async () => {
      const response = await protectedFetch(`${API_BASE_URL}/production/reason-codes/${code.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !code.active }),
      });
      if (!response.ok) throw new Error(t('The reason could not be changed'));
    });
  return (
    <Paper sx={{ p: 2 }} data-print-hide>
      <Typography variant="h6">{t('Downtime reason list')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t(
          'Operators pick these reasons when they classify a stop. Retired reasons stay on recorded stops.',
        )}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, my: 2 }}>
        {(codes.data ?? []).map((code) => (
          <Chip
            key={code.id}
            label={`${code.label} (${t(code.category === 'unplanned' ? 'Unplanned' : code.category === 'changeover' ? 'Changeover' : 'Planned')})`}
            color={code.active ? 'primary' : 'default'}
            variant={code.active ? 'filled' : 'outlined'}
            onClick={() => void setActive(code)}
            aria-label={`${code.label}: ${code.active ? t('Retire') : t('Restore')}`}
          />
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          label={t('Loss category')}
          value={draft.category}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="unplanned">{t('Unplanned')}</MenuItem>
          <MenuItem value="changeover">{t('Changeover')}</MenuItem>
          <MenuItem value="planned">{t('Planned')}</MenuItem>
        </TextField>
        <TextField
          label={t('New reason')}
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          sx={{ flexGrow: 1 }}
        />
        <Button
          variant="contained"
          disabled={!draft.label.trim()}
          onClick={() =>
            void run(async () => {
              await productionRequest('/reason-codes', draft);
              setDraft((d) => ({ ...d, label: '' }));
            })
          }
        >
          {t('Add reason')}
        </Button>
      </Stack>
    </Paper>
  );
};
