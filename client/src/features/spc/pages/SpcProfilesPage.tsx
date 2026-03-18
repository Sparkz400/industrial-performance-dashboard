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
  MenuItem,
  IconButton,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CalculateIcon from '@mui/icons-material/Calculate';
import TimelineIcon from '@mui/icons-material/Timeline';
import { useNavigate } from 'react-router-dom';
import {
  useSpcProfiles,
  useCreateSpcProfile,
  useUpdateSpcProfile,
  useDeleteSpcProfile,
  useComputeBaseline,
  type SpcProfile,
  type CreateSpcProfileRequest,
} from '../hooks/useSpcQueries';
import SpcAlertsList from '../components/SpcAlertsList';

const SPC_METHODS = [
  { value: 'zscore', label: 'Z-Score' },
  { value: 'moving_avg', label: 'Moving Average' },
  { value: 'std_bands', label: 'Standard Bands (Western Electric)' },
  { value: 'cusum', label: 'CUSUM' },
];

const emptyForm: CreateSpcProfileRequest = {
  name: '',
  machineId: 0,
  nodeKey: '',
  method: 'zscore',
  sensitivity: 3,
  windowSize: 100,
};

const SpcProfilesPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: profiles, isLoading, error } = useSpcProfiles();
  const createProfile = useCreateSpcProfile();
  const updateProfile = useUpdateSpcProfile();
  const deleteProfile = useDeleteSpcProfile();
  const computeBaseline = useComputeBaseline();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SpcProfile | null>(null);
  const [form, setForm] = useState<CreateSpcProfileRequest>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<SpcProfile | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);

  const handleOpenCreate = () => {
    setEditingProfile(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (profile: SpcProfile) => {
    setEditingProfile(profile);
    setForm({
      name: profile.name,
      machineId: profile.machineId ?? 0,
      nodeKey: profile.nodeKey,
      method: profile.method,
      sensitivity: profile.sensitivity,
      windowSize: profile.windowSize,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingProfile) {
      updateProfile.mutate(
        { id: editingProfile.id, ...form },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      createProfile.mutate(form, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteProfile.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">SPC Profiles</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setShowAlerts(!showAlerts)}>
            {showAlerts ? 'Hide Alerts' : 'Show Alerts'}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Create Profile
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load SPC profiles: {(error as Error).message}
        </Alert>
      )}

      {showAlerts && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            SPC Alerts
          </Typography>
          <SpcAlertsList />
        </Paper>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Machine ID</TableCell>
              <TableCell>Node Key</TableCell>
              <TableCell>Method</TableCell>
              <TableCell>Sensitivity</TableCell>
              <TableCell>UCL / Mean / LCL</TableCell>
              <TableCell>Baseline</TableCell>
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
            ) : profiles && profiles.length > 0 ? (
              profiles.map((profile) => (
                <TableRow
                  key={profile.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/spc/chart/${profile.id}`)}
                >
                  <TableCell>{profile.name}</TableCell>
                  <TableCell>{profile.machineId}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                      {profile.nodeKey}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={profile.method} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{profile.sensitivity}σ</TableCell>
                  <TableCell>
                    {profile.ucl != null ? (
                      <Typography variant="body2" fontSize="0.8rem">
                        {profile.ucl.toFixed(2)} / {profile.mean?.toFixed(2)} /{' '}
                        {profile.lcl?.toFixed(2)}
                      </Typography>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {profile.lastComputedAt ? (
                      <Chip label="Computed" size="small" color="success" variant="outlined" />
                    ) : (
                      <Chip label="Not computed" size="small" color="warning" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="View Chart">
                      <IconButton size="small" onClick={() => navigate(`/spc/chart/${profile.id}`)}>
                        <TimelineIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Compute Baseline">
                      <IconButton
                        size="small"
                        onClick={() => computeBaseline.mutate(profile.id)}
                        disabled={computeBaseline.isPending}
                      >
                        <CalculateIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => handleOpenEdit(profile)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteTarget(profile)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No SPC profiles configured. Create one to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingProfile ? 'Edit SPC Profile' : 'Create SPC Profile'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Profile Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Machine ID"
              type="number"
              value={form.machineId || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, machineId: parseInt(e.target.value, 10) || 0 }))
              }
              fullWidth
              required
            />
            <TextField
              label="Node Key"
              value={form.nodeKey}
              onChange={(e) => setForm((f) => ({ ...f, nodeKey: e.target.value }))}
              fullWidth
              required
              placeholder="e.g. ns=2;s=Temperature"
            />
            <TextField
              select
              label="Control Chart Method"
              value={form.method}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  method: e.target.value as CreateSpcProfileRequest['method'],
                }))
              }
              fullWidth
            >
              {SPC_METHODS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Sensitivity (sigma)"
              type="number"
              value={form.sensitivity}
              onChange={(e) =>
                setForm((f) => ({ ...f, sensitivity: parseFloat(e.target.value) || 3 }))
              }
              fullWidth
              slotProps={{ htmlInput: { min: 1, max: 6, step: 0.5 } }}
            />
            <TextField
              label="Window Size"
              type="number"
              value={form.windowSize || 100}
              onChange={(e) =>
                setForm((f) => ({ ...f, windowSize: parseInt(e.target.value, 10) || 100 }))
              }
              fullWidth
              slotProps={{ htmlInput: { min: 10, max: 10000 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={
              !form.name ||
              !form.machineId ||
              !form.nodeKey ||
              createProfile.isPending ||
              updateProfile.isPending
            }
          >
            {editingProfile ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete SPC Profile</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the profile <strong>{deleteTarget?.name}</strong>? This
            action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            color="error"
            disabled={deleteProfile.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SpcProfilesPage;
