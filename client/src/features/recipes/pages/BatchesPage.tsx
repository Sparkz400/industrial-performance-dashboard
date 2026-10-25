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
  useBatch,
  useBatchData,
  type Batch,
  type CreateBatchRequest,
  type BatchFilters,
} from '../hooks/useBatchQueries';

const statusColor: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  planned: 'info',
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
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5">Batch Monitoring</Typography>
          <Typography variant="body2" color="text.secondary">
            Track production runs and verify actual process values against specification tolerances.
          </Typography>
        </Box>
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
              <TableCell>Specification</TableCell>
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
                    {batch.recipeName ? `${batch.recipeName} (v${batch.recipeVersion})` : '-'}
                  </TableCell>
                  <TableCell>{batch.machineId ?? '-'}</TableCell>
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
                    {batch.completedAt ? new Date(batch.completedAt).toLocaleString() : '-'}
                  </TableCell>
                  <TableCell>{formatDuration(batch.startedAt, batch.completedAt)}</TableCell>
                  <TableCell align="right">
                    {batch.status === 'planned' && (
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
              label="Process Specification ID"
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
  const { data: batch, isLoading: batchLoading } = useBatch(batchId);
  const { data: seriesData, isLoading: dataLoading } = useBatchData(batchId);

  const isLoading = batchLoading || dataLoading;
  const hasSummary = batch?.summary && batch.summary.parameterResults.length > 0;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Batch Data {batch ? `- ${batch.batchNumber}` : ''}
        {batch && (
          <Chip
            label={batch.status}
            size="small"
            color={statusColor[batch.status] || 'default'}
            sx={{ ml: 1 }}
          />
        )}
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : hasSummary ? (
          <>
            {batch!.summary && (
              <Alert
                severity={batch!.summary.overallCompliance >= 90 ? 'success' : 'warning'}
                sx={{ mb: 2 }}
              >
                Overall Compliance: {batch!.summary.overallCompliance}% | Duration:{' '}
                {Math.round(batch!.summary.duration / 60000)}m
              </Alert>
            )}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Parameter</TableCell>
                    <TableCell align="right">Target</TableCell>
                    <TableCell align="right">Avg</TableCell>
                    <TableCell align="right">Min</TableCell>
                    <TableCell align="right">Max</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batch!.summary!.parameterResults.map((param) => (
                    <TableRow key={param.nodeKey}>
                      <TableCell>{param.displayName}</TableCell>
                      <TableCell align="right">{param.targetValue}</TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          color: param.withinTolerance ? 'success.main' : 'error.main',
                          fontWeight: 600,
                        }}
                      >
                        {param.actualAvg.toFixed(2)}
                      </TableCell>
                      <TableCell align="right">{param.actualMin.toFixed(2)}</TableCell>
                      <TableCell align="right">{param.actualMax.toFixed(2)}</TableCell>
                      <TableCell>
                        <Chip
                          label={param.withinTolerance ? 'OK' : 'Out of range'}
                          size="small"
                          color={param.withinTolerance ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : seriesData && seriesData.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Parameter</TableCell>
                  <TableCell align="right">Setpoint</TableCell>
                  <TableCell align="right">Current</TableCell>
                  <TableCell align="right">Min</TableCell>
                  <TableCell align="right">Max</TableCell>
                  <TableCell>Data Points</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {seriesData.map((series) => {
                  const values = series.dataPoints.map((dp) => dp.value);
                  const current = values.length > 0 ? values[values.length - 1] : null;
                  const min = values.length > 0 ? Math.min(...values) : null;
                  const max = values.length > 0 ? Math.max(...values) : null;
                  const inRange =
                    series.setpoint != null && current != null
                      ? Math.abs(current - series.setpoint) <= series.setpoint * 0.1
                      : true;
                  return (
                    <TableRow key={series.nodeKey}>
                      <TableCell>{series.displayName}</TableCell>
                      <TableCell align="right">
                        {series.setpoint != null ? series.setpoint : '-'}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          color: inRange ? 'success.main' : 'error.main',
                          fontWeight: 600,
                        }}
                      >
                        {current != null ? current.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell align="right">{min != null ? min.toFixed(2) : '-'}</TableCell>
                      <TableCell align="right">{max != null ? max.toFixed(2) : '-'}</TableCell>
                      <TableCell>{values.length}</TableCell>
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

        {batch?.status === 'aborted' && batch.abortReason && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Abort reason: {batch.abortReason}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BatchesPage;
