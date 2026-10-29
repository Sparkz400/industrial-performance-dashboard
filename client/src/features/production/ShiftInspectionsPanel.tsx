import React, { useRef, useState } from 'react';
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { translate as t } from '@/i18n';
import { productionRequest } from './CommissioningPanel';

interface Inspection {
  id: number;
  product: string;
  checkName: string;
  result: 'pass' | 'fail' | 'unknown';
  quantity: number;
  defectReason: string | null;
  note: string;
  reinspectsId: number | null;
  supersedesId: number | null;
  correctionReason: string | null;
  current: boolean;
}
interface Inspections {
  source: string;
  products: string[];
  plans: { id: number; product: string; checks: string[] }[];
  inspections: Inspection[];
  summary: {
    checks: {
      product: string;
      check: string;
      inspected: number;
      passed: number;
      failed: number;
      reworked: number;
      unknown: number;
    }[];
    missing: { product: string; check: string }[];
  };
  truncated: boolean;
}
const empty = {
  product: '',
  check: '',
  result: 'pass',
  quantity: '1',
  defectReason: '',
  note: '',
  link: '',
  correctionReason: '',
};
const tableSx = {
  borderCollapse: 'collapse',
  width: '100%',
  '& td, & th': { pr: 2, py: 0.5, textAlign: 'left' },
} as const;

/**
 * Manual inspections of the selected shift's products, with plans, rework and corrections.
 * @param root0
 * @param root0.shiftId
 * @param root0.machineId
 * @param root0.canRecord
 * @param root0.canPlan
 */
export default function ShiftInspectionsPanel({
  shiftId,
  machineId,
  canRecord,
  canPlan,
}: {
  shiftId: string;
  machineId: number;
  canRecord: boolean;
  canPlan: boolean;
}) {
  const [form, setForm] = useState(empty),
    [plan, setPlan] = useState({ product: '', checks: '' }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  // A retried submission keeps its request ID so the server records it once.
  const pending = useRef<{ payload: string; requestId: string } | null>(null);
  const query = useQuery({
    queryKey: ['shift-inspections', shiftId],
    queryFn: () => productionRequest<Inspections>(`/shifts/${shiftId}/inspections`),
  });
  const data = query.data;
  const planned = data?.plans.find((p) => p.product === form.product)?.checks ?? [];
  const linked = data?.inspections.find((i) => i.id === Number(form.link.slice(1)));
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await query.refetch();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const record = () =>
    run(async () => {
      const body = {
        product: form.product,
        check: form.check,
        result: form.result,
        quantity: Number(form.quantity),
        defectReason: form.result === 'fail' ? form.defectReason : null,
        note: form.note,
        reinspectsId: form.link.startsWith('r') ? Number(form.link.slice(1)) : null,
        supersedesId: form.link.startsWith('c') ? Number(form.link.slice(1)) : null,
        correctionReason: form.link.startsWith('c') ? form.correctionReason : null,
      };
      const payload = JSON.stringify(body);
      if (pending.current?.payload !== payload)
        pending.current = { payload, requestId: crypto.randomUUID() };
      await productionRequest(`/shifts/${shiftId}/inspections`, {
        ...body,
        requestId: pending.current.requestId,
      });
      pending.current = null;
      setForm(empty);
    });
  return (
    <Paper sx={{ p: 2, overflowX: 'auto' }} data-print-hide>
      <Stack spacing={2}>
        <Typography variant="h6">{t('Inspections (manual evidence)')}</Typography>
        <Typography variant="body2">
          {t(
            'Recorded by people, not machine sensors, and kept separate from machine counts. A part that passes reinspection after rework counts as reworked, never as both scrap and output. Corrections keep the original record.',
          )}
        </Typography>
        {(error || query.error) && <Alert severity="error">{error || String(query.error)}</Alert>}
        {data?.truncated && (
          <Alert severity="warning">{t('Showing the first 2,000 inspection records.')}</Alert>
        )}
        {!!data?.summary.checks.length && (
          <Box component="table" aria-label={t('Inspection summary')} sx={tableSx}>
            <thead>
              <tr>
                {['Product', 'Check', 'Inspected', 'Passed', 'Failed', 'Reworked', 'Unknown'].map(
                  (h) => (
                    <th key={h}>{t(h)}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.summary.checks.map((c) => (
                <tr key={`${c.product}\u0000${c.check}`}>
                  <td>{c.product}</td>
                  <td>{c.check}</td>
                  <td>{c.inspected}</td>
                  <td>{c.passed}</td>
                  <td>{c.failed}</td>
                  <td>{c.reworked}</td>
                  <td>{c.unknown}</td>
                </tr>
              ))}
            </tbody>
          </Box>
        )}
        {!!data?.summary.missing.length && (
          <Alert severity="warning">
            {t('Planned checks without an inspection:')}{' '}
            {data.summary.missing.map((m) => `${m.product} · ${m.check}`).join('; ')}
          </Alert>
        )}
        {data?.inspections.map((i) => (
          <Typography key={i.id} variant="body2" color={i.current ? undefined : 'text.secondary'}>
            #{i.id} {i.product} · {i.checkName} · {i.result} · {i.quantity}
            {i.defectReason ? ` · ${i.defectReason}` : ''}
            {i.reinspectsId ? ` · ${t('reinspects')} #${i.reinspectsId}` : ''}
            {i.supersedesId ? ` · ${t('corrects')} #${i.supersedesId}: ${i.correctionReason}` : ''}
            {i.current ? '' : ` · ${t('superseded')}`}
          </Typography>
        ))}
        {canRecord && data && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label={t('Inspected product')}
                value={form.product}
                onChange={(e) => setForm({ ...form, product: e.target.value, check: '' })}
                sx={{ minWidth: 180 }}
              >
                {data.products.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t('Check')}
                value={form.check}
                onChange={(e) => setForm({ ...form, check: e.target.value })}
                helperText={planned.length ? `${t('Plan:')} ${planned.join(', ')}` : t('No plan')}
              />
              <TextField
                select
                label={t('Inspection result')}
                value={form.result}
                onChange={(e) => setForm({ ...form, result: e.target.value })}
              >
                {['pass', 'fail', 'unknown'].map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t('Parts inspected')}
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </Stack>
            {form.result === 'fail' && (
              <TextField
                label={t('Defect reason')}
                value={form.defectReason}
                onChange={(e) => setForm({ ...form, defectReason: e.target.value })}
              />
            )}
            <TextField
              select
              label={t('Relates to')}
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            >
              <MenuItem value="">{t('New inspection')}</MenuItem>
              {data.inspections
                .filter((i) => i.current && !i.reinspectsId && i.result === 'fail')
                .map((i) => (
                  <MenuItem key={`r${i.id}`} value={`r${i.id}`}>
                    {t('Reinspection after rework of')} #{i.id} ({i.checkName})
                  </MenuItem>
                ))}
              {data.inspections
                .filter((i) => i.current)
                .map((i) => (
                  <MenuItem key={`c${i.id}`} value={`c${i.id}`}>
                    {t('Correction of')} #{i.id} ({i.checkName}, {i.result})
                  </MenuItem>
                ))}
            </TextField>
            {form.link.startsWith('c') && (
              <TextField
                label={t('Correction reason')}
                value={form.correctionReason}
                onChange={(e) => setForm({ ...form, correctionReason: e.target.value })}
              />
            )}
            <TextField
              label={t('Inspection note')}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            <Button
              variant="contained"
              disabled={
                busy ||
                !form.product ||
                !form.check ||
                Number(form.quantity) <= 0 ||
                (form.result === 'fail' && !form.defectReason) ||
                (form.link.startsWith('c') && !form.correctionReason) ||
                (!!form.link && !linked)
              }
              onClick={() => void record()}
            >
              {t('Record inspection')}
            </Button>
          </Stack>
        )}
        {canPlan && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t('Plan product')}
              value={plan.product}
              onChange={(e) => setPlan({ ...plan, product: e.target.value })}
            />
            <TextField
              label={t('Planned checks (comma separated)')}
              value={plan.checks}
              onChange={(e) => setPlan({ ...plan, checks: e.target.value })}
              sx={{ minWidth: 280 }}
            />
            <Button
              disabled={busy || !plan.product || !plan.checks.trim()}
              onClick={() =>
                void run(async () => {
                  await productionRequest(`/machines/${machineId}/inspection-plans`, {
                    product: plan.product,
                    checks: [
                      ...new Set(
                        plan.checks
                          .split(',')
                          .map((c) => c.trim())
                          .filter(Boolean),
                      ),
                    ],
                  });
                  setPlan({ product: '', checks: '' });
                })
              }
            >
              {t('Save inspection plan')}
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
