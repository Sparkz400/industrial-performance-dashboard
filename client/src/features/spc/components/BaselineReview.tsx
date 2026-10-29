import React, { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { operationRequest, localInput, toIso } from '@/features/operations/api';
interface Baseline {
  id: number;
  approved_at: string | null;
  evidence: {
    mean: number;
    stddev: number;
    sampleCount: number;
    excludedCount: number;
    violations: unknown[];
    digest: string;
    context?: { alarms: number; stops: number; products: string[] };
  };
}
/**
 *
 */
export default function BaselineReview() {
  const [profile, setProfile] = useState(''),
    [selected, setSelected] = useState(''),
    [review, setReview] = useState(''),
    [stable, setStable] = useState(false),
    [normal, setNormal] = useState(false),
    [lsl, setLsl] = useState(''),
    [usl, setUsl] = useState(''),
    [error, setError] = useState(''),
    [result, setResult] = useState<{ cp: number; cpk: number; scope: string } | null>(null),
    [busy, setBusy] = useState(false);
  const [start, setStart] = useState(localInput(new Date(Date.now() - 3600000).toISOString())),
    [end, setEnd] = useState(localInput(new Date().toISOString()));
  const client = useQueryClient();
  const profiles = useQuery({
    queryKey: ['baseline-profiles'],
    queryFn: () => operationRequest<{ id: number; name: string }[]>('/spc/profiles'),
  });
  const baselines = useQuery({
    queryKey: ['baselines', profile],
    queryFn: () => operationRequest<Baseline[]>(`/spc/profiles/${profile}/baselines`),
    enabled: !!profile,
  });
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2} sx={{ mt: 3 }}>
      <Typography variant="h6">Baseline review and capability</Typography>
      <Alert severity="info">
        Capability describes the approved reference period. Review process stability, measurement
        independence and approximate normality before approval.
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        select
        label="Baseline profile"
        value={profile}
        onChange={(e) => {
          setProfile(e.target.value);
          setSelected('');
          setStable(false);
          setNormal(false);
          setReview('');
          setResult(null);
        }}
      >
        {profiles.data?.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Reference period start"
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={start}
        onChange={(e) => setStart(e.target.value)}
      />
      <TextField
        label="Reference period end"
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={end}
        onChange={(e) => setEnd(e.target.value)}
      />
      <Button
        disabled={busy || !profile || !start || !end}
        onClick={() =>
          void run(async () => {
            await operationRequest(`/spc/profiles/${profile}/compute`, 'POST', {
              start: toIso(start),
              end: toIso(end),
            });
            await baselines.refetch();
          })
        }
      >
        Prepare baseline for review
      </Button>
      <TextField
        select
        label="Reference baseline"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setStable(false);
          setNormal(false);
          setReview('');
        }}
      >
        {baselines.data?.map((b) => (
          <MenuItem key={b.id} value={b.id}>
            {b.id} · {b.approved_at ? 'approved' : 'pending review'} · {b.evidence.sampleCount}{' '}
            readings · {b.evidence.violations.length} signals
          </MenuItem>
        ))}
      </TextField>
      {baselines.data
        ?.filter((b) => String(b.id) === String(selected))
        .map((b) => (
          <Typography key={b.id}>
            Mean {b.evidence.mean.toFixed(4)}, s {b.evidence.stddev.toFixed(4)}, excluded{' '}
            {b.evidence.excludedCount}. Evidence SHA-256: {b.evidence.digest}
            {b.evidence.context
              ? `. Window context: products ${b.evidence.context.products.join(', ') || 'not recorded'}; ${b.evidence.context.alarms} alarms and ${b.evidence.context.stops} classified stops overlap.`
              : '. Window context not recorded; compute a new candidate.'}
          </Typography>
        ))}
      <TextField
        label="Stability review and reference evidence"
        multiline
        value={review}
        onChange={(e) => setReview(e.target.value)}
      />
      <FormControlLabel
        control={<Checkbox checked={stable} onChange={(e) => setStable(e.target.checked)} />}
        label="I reviewed evidence of a stable process"
      />
      <FormControlLabel
        control={<Checkbox checked={normal} onChange={(e) => setNormal(e.target.checked)} />}
        label="I reviewed independence and approximate normality"
      />
      <Button
        disabled={busy || !selected || !stable || !normal || review.trim().length < 20}
        onClick={() =>
          void run(async () => {
            await operationRequest(`/spc/baselines/${selected}/approve`, 'POST', {
              review,
              stableProcess: stable,
              independentNormalObservations: normal,
            });
            await baselines.refetch();
            await client.invalidateQueries();
          })
        }
      >
        Approve reference baseline
      </Button>
      <TextField
        label="Lower specification limit"
        type="number"
        value={lsl}
        onChange={(e) => {
          setLsl(e.target.value);
          setResult(null);
        }}
      />
      <TextField
        label="Upper specification limit"
        type="number"
        value={usl}
        onChange={(e) => {
          setUsl(e.target.value);
          setResult(null);
        }}
      />
      <Button
        disabled={busy || !profile || !lsl || !usl || Number(usl) <= Number(lsl)}
        onClick={() =>
          void run(async () =>
            setResult(
              await operationRequest(
                `/spc/profiles/${profile}/capability?${new URLSearchParams({ lsl, usl })}`,
              ),
            ),
          )
        }
      >
        Calculate reference capability
      </Button>
      {result && (
        <Alert severity="info">
          Cp {result.cp.toFixed(3)} · Cpk {result.cpk.toFixed(3)}. {result.scope}
        </Alert>
      )}
    </Stack>
  );
}
