import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Collapse,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';

interface PlantMember {
  id: number;
  userId: number;
  username: string;
  role: string;
}

interface Plant {
  id: number;
  name: string;
  location: string | null;
  timezone: string;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PlantFormValues {
  name: string;
  location: string;
  timezone: string;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Stockholm',
  'Asia/Tokyo',
  'Asia/Shanghai',
];

const defaultFormValues: PlantFormValues = {
  name: '',
  location: '',
  timezone: 'UTC',
};

const fetchPlants = async (): Promise<Plant[]> => {
  const res = await protectedFetch(API_ENDPOINTS.plants.base);
  if (!res.ok) throw new Error('Failed to fetch plants');
  return res.json();
};

const fetchMembers = async (plantId: number): Promise<PlantMember[]> => {
  const res = await protectedFetch(API_ENDPOINTS.plants.members(plantId));
  if (!res.ok) throw new Error('Failed to fetch members');
  return res.json();
};

const PlantsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Plant | null>(null);
  const [formValues, setFormValues] = useState<PlantFormValues>(defaultFormValues);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [expandedPlantId, setExpandedPlantId] = useState<number | null>(null);
  const [addMemberPlantId, setAddMemberPlantId] = useState<number | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState('');

  const {
    data: plants = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['plants'],
    queryFn: fetchPlants,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['plantMembers', expandedPlantId],
    queryFn: () => fetchMembers(expandedPlantId!),
    enabled: !!expandedPlantId,
  });

  const createMutation = useMutation({
    mutationFn: async (values: PlantFormValues) => {
      const res = await protectedFetch(API_ENDPOINTS.plants.base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to create plant');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plants'] });
      handleCloseForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: PlantFormValues }) => {
      const res = await protectedFetch(API_ENDPOINTS.plants.byId(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to update plant');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plants'] });
      handleCloseForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await protectedFetch(API_ENDPOINTS.plants.byId(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete plant');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plants'] });
      setDeleteConfirm(null);
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ plantId, userId }: { plantId: number; userId: number }) => {
      const res = await protectedFetch(API_ENDPOINTS.plants.members(plantId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Failed to add member');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plantMembers'] });
      queryClient.invalidateQueries({ queryKey: ['plants'] });
      setAddMemberPlantId(null);
      setNewMemberUserId('');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ plantId, memberId }: { plantId: number; memberId: number }) => {
      const res = await protectedFetch(API_ENDPOINTS.plants.memberById(plantId, memberId), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove member');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plantMembers'] });
      queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
  });

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingPlant(null);
    setFormValues(defaultFormValues);
    setFormErrors({});
  }, []);

  const handleOpenCreate = useCallback(() => {
    setEditingPlant(null);
    setFormValues(defaultFormValues);
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((plant: Plant) => {
    setEditingPlant(plant);
    setFormValues({
      name: plant.name,
      location: plant.location ?? '',
      timezone: plant.timezone,
    });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = 'Name is required';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (editingPlant) {
      updateMutation.mutate({ id: editingPlant.id, values: formValues });
    } else {
      createMutation.mutate(formValues);
    }
  };

  const toggleExpand = (plantId: number) => {
    setExpandedPlantId((prev) => (prev === plantId ? null : plantId));
  };

  const mutationError =
    createMutation.error ||
    updateMutation.error ||
    deleteMutation.error ||
    addMemberMutation.error ||
    removeMemberMutation.error;

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 'bold',
            }}
          >
            Plants
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            Manage plant locations and their members
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Add Plant
          </Button>
        </Box>
      </Box>

      {(error || mutationError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error)?.message || (mutationError as Error)?.message}
        </Alert>
      )}

      {isLoading ? (
        <PageSkeleton variant="cards" count={3} />
      ) : plants.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{
              color: 'text.secondary',
            }}
          >
            No plants configured
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              mb: 3,
            }}
          >
            Add a plant to organize your machines by location.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Add Your First Plant
          </Button>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={40} />
                <TableCell>Name</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Timezone</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Members</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plants.map((plant) => (
                <React.Fragment key={plant.id}>
                  <TableRow>
                    <TableCell>
                      <IconButton size="small" onClick={() => toggleExpand(plant.id)}>
                        {expandedPlantId === plant.id ? (
                          <ExpandLessIcon fontSize="small" />
                        ) : (
                          <ExpandMoreIcon fontSize="small" />
                        )}
                      </IconButton>
                    </TableCell>
                    <TableCell>{plant.name}</TableCell>
                    <TableCell>{plant.location || '-'}</TableCell>
                    <TableCell>{plant.timezone}</TableCell>
                    <TableCell>
                      <Chip
                        label={plant.isActive ? 'Active' : 'Inactive'}
                        color={plant.isActive ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{plant.memberCount ?? 0}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => handleOpenEdit(plant)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleteConfirm(plant)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      sx={{
                        py: 0,
                        borderBottom: expandedPlantId === plant.id ? undefined : 'none',
                      }}
                    >
                      <Collapse in={expandedPlantId === plant.id} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, pl: 4 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Typography variant="subtitle2">Members</Typography>
                            <IconButton
                              size="small"
                              onClick={() =>
                                setAddMemberPlantId(addMemberPlantId === plant.id ? null : plant.id)
                              }
                            >
                              <PersonAddIcon fontSize="small" />
                            </IconButton>
                          </Box>
                          {addMemberPlantId === plant.id && (
                            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                              <TextField
                                label="User ID"
                                size="small"
                                type="number"
                                value={newMemberUserId}
                                onChange={(e) => setNewMemberUserId(e.target.value)}
                              />
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => {
                                  if (newMemberUserId) {
                                    addMemberMutation.mutate({
                                      plantId: plant.id,
                                      userId: Number(newMemberUserId),
                                    });
                                  }
                                }}
                                disabled={addMemberMutation.isPending}
                              >
                                Add
                              </Button>
                            </Box>
                          )}
                          {members.length === 0 ? (
                            <Typography
                              variant="body2"
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              No members in this plant
                            </Typography>
                          ) : (
                            <List dense disablePadding>
                              {members.map((member) => (
                                <ListItem key={member.id} disablePadding sx={{ py: 0.5 }}>
                                  <ListItemText
                                    primary={member.username}
                                    secondary={member.role}
                                    slotProps={{
                                      primary: { variant: 'body2' },
                                      secondary: {
                                        variant: 'caption',
                                        sx: { textTransform: 'capitalize' },
                                      },
                                    }}
                                  />
                                  <ListItemSecondaryAction>
                                    <IconButton
                                      size="small"
                                      edge="end"
                                      onClick={() =>
                                        removeMemberMutation.mutate({
                                          plantId: plant.id,
                                          memberId: member.id,
                                        })
                                      }
                                    >
                                      <PersonRemoveIcon fontSize="small" />
                                    </IconButton>
                                  </ListItemSecondaryAction>
                                </ListItem>
                              ))}
                            </List>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onClose={handleCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPlant ? 'Edit Plant' : 'Add Plant'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              value={formValues.name}
              onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
              error={!!formErrors.name}
              helperText={formErrors.name}
              fullWidth
              required
            />
            <TextField
              label="Location"
              value={formValues.location}
              onChange={(e) => setFormValues((prev) => ({ ...prev, location: e.target.value }))}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Timezone</InputLabel>
              <Select
                value={formValues.timezone}
                label="Timezone"
                onChange={(e) => setFormValues((prev) => ({ ...prev, timezone: e.target.value }))}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <MenuItem key={tz} value={tz}>
                    {tz}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForm}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Plant</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This will remove all
            member assignments. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PlantsPage;
