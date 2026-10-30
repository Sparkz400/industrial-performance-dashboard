import ResponsiveTable from '@/shared/components/ResponsiveTable';
import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
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
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  useRecipes,
  useCreateRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useCreateNewVersion,
  type Recipe,
  type CreateRecipeRequest,
} from '../hooks/useRecipeQueries';

const statusColor: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
  draft: 'info',
  active: 'success',
  archived: 'default',
};

const RecipesPage: React.FC = () => {
  const { data: recipes, isLoading, error } = useRecipes();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const createNewVersion = useCreateNewVersion();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Recipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [form, setForm] = useState<CreateRecipeRequest>({
    name: '',
    machineId: 0,
    description: '',
    parameters: [],
  });

  const handleOpenCreate = () => {
    setEditTarget(null);
    setForm({ name: '', machineId: 0, description: '', parameters: [] });
    setDialogOpen(true);
  };

  const handleOpenEdit = (recipe: Recipe) => {
    setEditTarget(recipe);
    setForm({
      name: recipe.name,
      machineId: recipe.machineId,
      description: recipe.description,
      parameters: recipe.parameters,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editTarget) {
      updateRecipe.mutate(
        {
          id: editTarget.id,
          name: form.name,
          description: form.description,
          parameters: form.parameters,
        },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      createRecipe.mutate(form, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const handleArchive = (recipe: Recipe) => {
    updateRecipe.mutate({ id: recipe.id, status: 'archived' });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteRecipe.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, width: '100%', mx: 'auto' }}>
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Process Specifications
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            Define reference parameters and tolerances for compliance monitoring during batch runs.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          New Specification
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load recipes: {(error as Error).message}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <ResponsiveTable
          labels={['Name', 'Version', 'Status', 'Machine ID', 'Parameters', 'Created', 'Actions']}
        >
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Version</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Machine ID</TableCell>
              <TableCell>Parameters</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : recipes && recipes.length > 0 ? (
              recipes.map((recipe) => (
                <TableRow key={recipe.id} hover>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                      }}
                    >
                      {recipe.name}
                    </Typography>
                    {recipe.description && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        {recipe.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>v{recipe.version}</TableCell>
                  <TableCell>
                    <Chip
                      label={recipe.status}
                      size="small"
                      color={statusColor[recipe.status] || 'default'}
                    />
                  </TableCell>
                  <TableCell>{recipe.machineId}</TableCell>
                  <TableCell>{recipe.parameters.length}</TableCell>
                  <TableCell>{new Date(recipe.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="New Version">
                      <IconButton
                        size="small"
                        onClick={() => createNewVersion.mutate(recipe.id)}
                        disabled={createNewVersion.isPending}
                      >
                        <ContentCopyIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => handleOpenEdit(recipe)}
                        disabled={recipe.status === 'archived'}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Archive">
                      <IconButton
                        size="small"
                        onClick={() => handleArchive(recipe)}
                        disabled={recipe.status === 'archived'}
                      >
                        <ArchiveIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteTarget(recipe)}
                        disabled={recipe.status === 'active'}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    No process specifications found. Create one to define compliance reference
                    values.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </ResponsiveTable>
      </TableContainer>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTarget ? 'Edit Specification' : 'New Process Specification'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Specification Name"
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
              disabled={!!editTarget}
            />
            <TextField
              label="Description"
              value={form.description || ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
            />
            <Typography
              variant="subtitle2"
              sx={{
                color: 'text.secondary',
              }}
            >
              Parameters and tolerances can be configured after creation.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={
              !form.name || !form.machineId || createRecipe.isPending || updateRecipe.isPending
            }
          >
            {editTarget ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Specification</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong> (v
            {deleteTarget?.version})? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            color="error"
            disabled={deleteRecipe.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecipesPage;
