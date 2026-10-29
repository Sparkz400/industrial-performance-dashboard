import React, { useRef, useState } from 'react';
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
interface Inspection {
  id: number;
  check_name: string;
  result: string;
  quantity: number;
  defect_reason: string | null;
}
interface Rework {
  id: number;
  action: string;
  owner_id: number;
  due_at: string;
  completed_at: string | null;
}
interface Lot {
  id: number;
  lot: string;
  direction: string;
  /** Latest corrected quantity; null when the link is void. */
  quantity: number | null;
  declared_quantity: number;
  correction_id: number | null;
  unit: string;
  batch_id: number;
}
interface LotCorrection {
  id: number;
  lot_link_id: number;
  quantity: number | null;
  reason: string;
  created_at: string;
}
const lotText = (l: Lot) =>
  `${l.direction} · ${l.lot} · ${l.quantity ?? 'void'}${l.quantity == null ? '' : ` ${l.unit}`}${
    l.correction_id ? ` (declared ${l.declared_quantity} ${l.unit}, corrected)` : ''
  }`;
/**
 *
 * @param root0
 * @param root0.batchId
 */
export default function BatchQualityPanel({ batchId }: { batchId: number }) {
  const pendingInspection = useRef<{ payload: string; requestId: string } | null>(null);
  const queryClient = useQueryClient();
  const [check, setCheck] = useState(''),
    [result, setResult] = useState('unknown'),
    [quantity, setQuantity] = useState('1'),
    [reason, setReason] = useState('');
  const [inspection, setInspection] = useState(''),
    [owner, setOwner] = useState(''),
    [action, setAction] = useState(''),
    [due, setDue] = useState(localInput(new Date(Date.now() + 86400000).toISOString()));
  const [rework, setRework] = useState(''),
    [verification, setVerification] = useState(''),
    [note, setNote] = useState('');
  const [lot, setLot] = useState(''),
    [direction, setDirection] = useState('input'),
    [unit, setUnit] = useState('pieces'),
    [lotQuantity, setLotQuantity] = useState('1'),
    [supplier, setSupplier] = useState('');
  const [correcting, setCorrecting] = useState(''),
    [corrected, setCorrected] = useState(''),
    [voiding, setVoiding] = useState(false),
    [correctionReason, setCorrectionReason] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [trace, setTrace] = useState<{
      links: Lot[];
      corrections: LotCorrection[];
      truncated: boolean;
    } | null>(null);
  const query = useQuery({
    queryKey: ['batch-quality', batchId],
    queryFn: () =>
      operationRequest<{
        inspections: Inspection[];
        rework: Rework[];
        lots: Lot[];
        lotCorrections: LotCorrection[];
      }>(`/quality/batches/${batchId}`),
  });
  const correctedLot = query.data?.lots.find((l) => l.id === Number(correcting));
  const owners = useQuery({
    queryKey: ['action-owners'],
    queryFn: () =>
      operationRequest<{ id: number; username: string }[]>('/production/operator/owners'),
  });
  const save = async (path: string, body: unknown) => {
    setBusy(true);
    setError('');
    try {
      await operationRequest(path, 'POST', body);
      await query.refetch();
      await queryClient.invalidateQueries({ queryKey: ['batches'] });
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2} sx={{ mt: 3 }}>
      <Typography variant="h6">Inspections and lot traceability</Typography>
      <Alert severity="info">
        Measurement compliance covers recorded good-quality samples against the frozen recipe. It is
        separate from inspection disposition. Refresh a completed batch summary after late
        measurements arrive.
      </Alert>
      <Button disabled={busy} onClick={() => void save(`/batches/${batchId}/summary`, {})}>
        Refresh summary including late measurements
      </Button>
      {(error || query.error) && <Alert severity="error">{error || String(query.error)}</Alert>}
      {query.data?.inspections.map((i) => (
        <Typography key={i.id}>
          Inspection {i.id}: {i.check_name} — {i.result}, {i.quantity} inspected{' '}
          {i.defect_reason && `· ${i.defect_reason}`}
        </Typography>
      ))}
      <TextField
        label="Inspection check"
        value={check}
        onChange={(e) => setCheck(e.target.value)}
      />
      <TextField
        select
        label="Inspection result"
        value={result}
        onChange={(e) => setResult(e.target.value)}
      >
        {['unknown', 'pass', 'fail'].map((v) => (
          <MenuItem key={v} value={v}>
            {v}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Inspected quantity"
        type="number"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      {result === 'fail' && (
        <TextField
          label="Defect reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      <Button
        disabled={busy || !check || Number(quantity) <= 0 || (result === 'fail' && !reason)}
        onClick={async () => {
          const body = {
            check,
            result,
            quantity: Number(quantity),
            defectReason: result === 'fail' ? reason : null,
          };
          const payload = JSON.stringify({ batchId, ...body });
          // Keep the identity when a response is lost after the server commits.
          if (pendingInspection.current?.payload !== payload)
            pendingInspection.current = { payload, requestId: crypto.randomUUID() };
          if (
            await save(`/quality/batches/${batchId}/inspections`, {
              ...body,
              requestId: pendingInspection.current.requestId,
            })
          )
            pendingInspection.current = null;
        }}
      >
        Record inspection
      </Button>
      <Typography variant="h6">Rework</Typography>
      {query.data?.rework.map((r) => (
        <Typography key={r.id}>
          Action {r.id}: {r.action} · owner {r.owner_id} · due {new Date(r.due_at).toLocaleString()}{' '}
          · {r.completed_at ? 'Verified' : 'Open'}
        </Typography>
      ))}
      <TextField
        select
        label="Failed inspection"
        value={inspection}
        onChange={(e) => setInspection(e.target.value)}
      >
        {query.data?.inspections
          .filter((i) => i.result === 'fail')
          .map((i) => (
            <MenuItem key={i.id} value={i.id}>
              {i.id} · {i.check_name}
            </MenuItem>
          ))}
      </TextField>
      <TextField
        select
        label="Rework owner"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
      >
        {owners.data?.map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.username}
          </MenuItem>
        ))}
      </TextField>
      <TextField label="Rework action" value={action} onChange={(e) => setAction(e.target.value)} />
      <TextField
        label="Rework deadline"
        type="datetime-local"
        slotProps={{ inputLabel: { shrink: true } }}
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <Button
        disabled={busy || !inspection || !owner || !action || !due}
        onClick={() =>
          void save(`/quality/batches/${batchId}/rework`, {
            inspectionId: Number(inspection),
            ownerId: Number(owner),
            action,
            dueAt: toIso(due),
          })
        }
      >
        Assign rework
      </Button>
      <TextField
        select
        label="Open rework"
        value={rework}
        onChange={(e) => setRework(e.target.value)}
      >
        {query.data?.rework
          .filter((r) => !r.completed_at)
          .map((r) => (
            <MenuItem key={r.id} value={r.id}>
              {r.id} · {r.action}
            </MenuItem>
          ))}
      </TextField>
      <TextField
        select
        label="Verification inspection"
        value={verification}
        onChange={(e) => setVerification(e.target.value)}
      >
        {query.data?.inspections
          .filter((i) => i.result === 'pass')
          .map((i) => (
            <MenuItem key={i.id} value={i.id}>
              {i.id} · {i.check_name}
            </MenuItem>
          ))}
      </TextField>
      <TextField label="Verification note" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button
        disabled={busy || !rework || !verification || !note}
        onClick={() =>
          void save(`/quality/rework/${rework}/complete`, {
            inspectionId: Number(verification),
            note,
          })
        }
      >
        Verify rework completion
      </Button>
      <Typography variant="h6">Lots</Typography>
      {query.data?.lots.map((l) => (
        <Typography key={l.id}>{lotText(l)}</Typography>
      ))}
      {query.data?.lotCorrections.map((c) => (
        <Typography key={c.id} variant="body2">
          Correction {c.id} of link {c.lot_link_id}: {c.quantity ?? 'void'} · {c.reason} ·{' '}
          {new Date(c.created_at).toLocaleString()}
        </Typography>
      ))}
      {!!query.data?.lots.length && (
        <>
          <TextField
            select
            label="Lot link to correct"
            value={correcting}
            onChange={(e) => setCorrecting(e.target.value)}
          >
            {query.data.lots.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {lotText(l)}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Checkbox checked={voiding} onChange={(e) => setVoiding(e.target.checked)} />}
            label="Void this lot link"
          />
          {!voiding && (
            <TextField
              label="Corrected lot quantity"
              type="number"
              value={corrected}
              onChange={(e) => setCorrected(e.target.value)}
            />
          )}
          <TextField
            label="Correction reason"
            value={correctionReason}
            onChange={(e) => setCorrectionReason(e.target.value)}
          />
          <Button
            disabled={
              busy || !correctedLot || !correctionReason || (!voiding && Number(corrected) <= 0)
            }
            onClick={async () => {
              if (
                await save(`/quality/lots/${correctedLot!.id}/corrections`, {
                  quantity: voiding ? null : Number(corrected),
                  reason: correctionReason,
                  previousCorrectionId: correctedLot!.correction_id,
                })
              ) {
                setCorrected('');
                setCorrectionReason('');
                setVoiding(false);
              }
            }}
          >
            Record lot correction
          </Button>
        </>
      )}
      <TextField label="Lot identifier" value={lot} onChange={(e) => setLot(e.target.value)} />
      <TextField
        select
        label="Lot direction"
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
      >
        {['input', 'output'].map((v) => (
          <MenuItem key={v} value={v}>
            {v}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Lot quantity"
        type="number"
        value={lotQuantity}
        onChange={(e) => setLotQuantity(e.target.value)}
      />
      <TextField label="Lot unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <TextField
        label="Supplier reference for external input"
        value={supplier}
        onChange={(e) => setSupplier(e.target.value)}
      />
      <Button
        disabled={busy || !lot || !unit || Number(lotQuantity) <= 0}
        onClick={() =>
          void save(`/quality/batches/${batchId}/lots`, {
            lot,
            direction,
            quantity: Number(lotQuantity),
            unit,
            supplierReference: supplier || null,
          })
        }
      >
        Link lot
      </Button>
      <Button
        onClick={() => {
          setError('');
          void operationRequest<NonNullable<typeof trace>>(`/quality/batches/${batchId}/trace`)
            .then(setTrace)
            .catch((e) => setError(String(e)));
        }}
      >
        Trace related lots and batches
      </Button>
      {trace?.links.map((l) => (
        <Typography key={l.id}>
          Batch {l.batch_id} · {lotText(l)}
        </Typography>
      ))}
      {!!trace?.corrections.length && (
        <Typography variant="body2">
          {trace.corrections.length} correction(s) recorded on these links; void links do not
          connect batches.
        </Typography>
      )}
      {trace?.truncated && (
        <Alert severity="warning">
          Trace exceeds 5,000 links; displayed results are incomplete.
        </Alert>
      )}
    </Stack>
  );
}
