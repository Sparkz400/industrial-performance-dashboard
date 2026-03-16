import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StopIcon from '@mui/icons-material/Stop';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  useBatches,
  useCreateBatch,
  useStartBatch,
  useCompleteBatch,
  useAbortBatch,
  useBatchData,
  type Batch,
  type CreateBatchRequest,
  type BatchFilters,
} from '../hooks/useBatchQueries';

const statusColor: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'info',
  running: 'warning',
  completed: 'success',
  aborted: 'error',
};

const BatchesPage: React.FC = () => {
  const [filters] = useState<BatchFilters>({});
  const { data: batches, isLoading, error } = useBatches(filters);
  const createBatch = useCreateBatch();
  const startBatch = useStartBatch();
  const completeBatch = useCompleteBatch();
  const abortBatch = useAbortBatch();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateBatchRequest>({
    recipeId: 0,
    machineId: 0,
  });
  const [abortTarget, setAbortTarget] = useState<Batch | null>(null);
  const [abortReason, setAbortReason] = useState('');
  const [detailBatchId, setDetailBatchId] = useState<number | null>(null);

  const handleCreate = () => {
    createBatch.mutate(createForm, {
      onSuccess: () => {
        setCreateOpen(false);
        setCreateForm({ recipeId: 0, machineId: 0 });
      },
    });
  };

  const handleAbort = () => {
    if (!abortTarget) return;
    abortBatch.mutate(
      { id: abortTarget.id, reason: abortReason },
      {
        onSuccess: () => {
          setAbortTarget(null);
          setAbortReason('');
        },
      },
    );
  };

  const formatDuration = (start: string | null, end: string | null): string => {
    if (!start) return '-';
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    const diffMs = endMs - startMs;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Batches</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Create Batch
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load batches: {(error as Error).message}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Batch Number</TableCell>
              <TableCell>Recipe</TableCell>
              <TableCell>Machine ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Started</TableCell>
              <TableCell>Completed</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : batches && batches.length > 0 ? (
              batches.map((batch) => (
                <TableRow key={batch.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                      {batch.batchNumber}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {batch.recipeName} (v{batch.recipeVersion})
                  </TableCell>
                  <TableCell>{batch.machineId}</TableCell>
                  <TableCell>
                    <Chip
                      label={batch.status}
                      size="small"
                      color={statusColor[batch.status] || 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {batch.startedAt ? new Date(batch.startedAt).toLocaleString() : '-'}
                  </TableCell>
                  <TableCell>
                    {batch.completedAt
                      ? new Date(batch.completedAt).toLocaleString()
                      : batch.abortedAt
                        ? new Date(batch.abortedAt).toLocaleString()
                        : '-'}
                  </TableCell>
                  <TableCell>
                    {formatDuration(batch.startedAt, batch.completedAt || batch.abortedAt)}
                  </TableCell>
                  <TableCell align="right">
                    {batch.status === 'pending' && (
                      <Tooltip title="Start Batch">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => startBatch.mutate(batch.id)}
                          disabled={startBatch.isPending}
                        >
                          <PlayArrowIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {batch.status === 'running' && (
                      <>
                        <Tooltip title="Complete Batch">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => completeBatch.mutate(batch.id)}
                            disabled={completeBatch.isPending}
                          >
                            <CheckCircleIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Abort Batch">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setAbortTarget(batch)}
                          >
                            <StopIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    <Tooltip title="View Data">
                      <IconButton size="small" onClick={() => setDetailBatchId(batch.id)}>
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No batches found.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Batch</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Recipe ID"
              type="number"
              value={createForm.recipeId || ''}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, recipeId: parseInt(e.target.value, 10) || 0 }))
              }
              fullWidth
              required
            />
            <TextField
              label="Machine ID"
              type="number"
              value={createForm.machineId || ''}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, machineId: parseInt(e.target.value, 10) || 0 }))
              }
              fullWidth
              required
            />
            <TextField
              label="Batch Number (optional)"
              value={createForm.batchNumber || ''}
              onChange={(e) => setCreateForm((f) => ({ ...f, batchNumber: e.target.value }))}
              fullWidth
              placeholder="Auto-generated if left blank"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={!createForm.recipeId || !createForm.machineId || createBatch.isPending}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Abort Dialog */}
      <Dialog open={!!abortTarget} onClose={() => setAbortTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Abort Batch</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to abort batch <strong>{abortTarget?.batchNumber}</strong>?
          </Typography>
          <TextField
            label="Reason for aborting"
            value={abortReason}
            onChange={(e) => setAbortReason(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAbortTarget(null)}>Cancel</Button>
          <Button
            onClick={handleAbort}
            variant="contained"
            color="error"
            disabled={abortBatch.isPending}
          >
            Abort
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Detail Dialog */}
      {detailBatchId && (
        <BatchDetailDialog batchId={detailBatchId} onClose={() => setDetailBatchId(null)} />
      )}
    </Box>
  );
};

// ── Batch Detail Dialog ────────────────────────────────────────────────────

interface BatchDetailDialogProps {
  batchId: number;
  onClose: () => void;
}

const BatchDetailDialog: React.FC<BatchDetailDialogProps> = ({ batchId, onClose }) => {
  const { data, isLoading } = useBatchData(batchId);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Batch Data</DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : data ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Parameter</TableCell>
                  <TableCell>Setpoint</TableCell>
                  <TableCell>Current</TableCell>
                  <TableCell>Min</TableCell>
                  <TableCell>Max</TableCell>
                  <TableCell>Unit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.parameters.map((param) => {
                  const inRange =
                    param.currentValue >= param.min && param.currentValue <= param.max;
                  return (
                    <TableRow key={param.name}>
                      <TableCell>{param.name}</TableCell>
                      <TableCell>{param.setpoint}</TableCell>
                      <TableCell
                        sx={{ color: inRange ? 'success.main' : 'error.main', fontWeight: 600 }}
                      >
                        {param.currentValue}
                      </TableCell>
                      <TableCell>{param.min}</TableCell>
                      <TableCell>{param.max}</TableCell>
                      <TableCell>{param.unit}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No batch data available.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BatchesPage;
