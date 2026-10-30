import ResponsiveTable from '@/shared/components/ResponsiveTable';
import React, { useState, useCallback, useEffect } from 'react';
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
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Switch,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';
import { useMachineStore } from '@/stores/useMachineStore';
import type { ScheduledReportConfig, ScheduledReportSection } from '@performance-dashboard/shared';

interface ReportTemplate {
  id: number;
  name: string;
  type: 'shift' | 'daily' | 'weekly';
  description: string;
  isActive: boolean;
  templateConfig: ScheduledReportConfig;
}

interface TemplateFormValues {
  name: string;
  type: 'shift' | 'daily' | 'weekly';
  description: string;
  isActive: boolean;
  sections: string[];
  templateConfig: ScheduledReportConfig;
}

const TEMPLATE_TYPES = ['shift', 'daily', 'weekly'] as const;

const AVAILABLE_SECTIONS = [
  { key: 'oee', label: 'OEE Summary' },
  { key: 'alerts', label: 'Alert Summary' },
  { key: 'trending', label: 'Trending Data' },
];

const getTypeColor = (type: string): 'primary' | 'secondary' | 'success' => {
  switch (type) {
    case 'shift':
      return 'primary';
    case 'daily':
      return 'secondary';
    case 'weekly':
      return 'success';
    default:
      return 'primary';
  }
};

const defaultFormValues: TemplateFormValues = {
  name: '',
  type: 'daily',
  description: '',
  isActive: true,
  sections: [],
  templateConfig: { lookbackHours: 24, sections: [] },
};

const templatePayload = ({ sections, templateConfig, ...values }: TemplateFormValues) => ({
  ...values,
  templateConfig: {
    ...templateConfig,
    sections: sections.flatMap((type) => {
      const existing = templateConfig.sections?.filter((section) => section.type === type);
      return existing?.length ? existing : [{ type }];
    }),
  },
});

const fetchTemplates = async (): Promise<ReportTemplate[]> => {
  const res = await protectedFetch(API_ENDPOINTS.reports.templates);
  if (!res.ok) throw new Error('Failed to fetch report templates');
  return res.json();
};

const ReportTemplatesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const machines = useMachineStore((s) => s.machines);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);
  useEffect(() => {
    void fetchMachines();
  }, [fetchMachines]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ReportTemplate | null>(null);
  const [formValues, setFormValues] = useState<TemplateFormValues>(defaultFormValues);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const {
    data: templates = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['reportTemplates'],
    queryFn: fetchTemplates,
  });

  const createMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      const res = await protectedFetch(API_ENDPOINTS.reports.templates, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templatePayload(values)),
      });
      if (!res.ok) throw new Error('Failed to create template');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      handleCloseForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: TemplateFormValues }) => {
      const res = await protectedFetch(API_ENDPOINTS.reports.templateById(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templatePayload(values)),
      });
      if (!res.ok) throw new Error('Failed to update template');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      handleCloseForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await protectedFetch(API_ENDPOINTS.reports.templateById(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete template');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      setDeleteConfirm(null);
    },
  });

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingTemplate(null);
    setFormValues(defaultFormValues);
    setFormErrors({});
  }, []);

  const handleOpenCreate = useCallback(() => {
    setEditingTemplate(null);
    setFormValues(defaultFormValues);
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((template: ReportTemplate) => {
    setEditingTemplate(template);
    setFormValues({
      name: template.name,
      type: template.type,
      description: template.description,
      isActive: template.isActive,
      sections: [
        ...new Set(template.templateConfig?.sections?.map((section) => section.type) ?? []),
      ],
      templateConfig: template.templateConfig ?? {},
    });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleSectionToggle = (sectionKey: string) => {
    setFormValues((prev) => ({
      ...prev,
      sections: prev.sections.includes(sectionKey)
        ? prev.sections.filter((s) => s !== sectionKey)
        : [...prev.sections, sectionKey],
    }));
  };

  const updateSection = (type: string, values: Partial<ScheduledReportSection>) =>
    setFormValues((previous) => {
      const sections = previous.templateConfig.sections ?? [];
      return {
        ...previous,
        templateConfig: {
          ...previous.templateConfig,
          sections: sections.some((section) => section.type === type)
            ? sections.map((section, index) =>
                index === sections.findIndex((item) => item.type === type)
                  ? { ...section, ...values }
                  : section,
              )
            : [...sections, { type, ...values }],
        },
      };
    });

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = 'Name is required';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, values: formValues });
    } else {
      createMutation.mutate(formValues);
    }
  };

  const mutationError = createMutation.error || updateMutation.error || deleteMutation.error;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minWidth: 0, width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 'bold',
            }}
          >
            Report Templates
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            Configure report templates for automated report generation
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Create Template
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
      ) : templates.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{
              color: 'text.secondary',
            }}
          >
            No report templates configured
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              mb: 3,
            }}
          >
            Create templates to define the structure of your automated reports.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Create Your First Template
          </Button>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <ResponsiveTable labels={['Name', 'Type', 'Description', 'Active', 'Actions']}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>{template.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={template.type}
                      color={getTypeColor(template.type)}
                      size="small"
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell>{template.description}</TableCell>
                  <TableCell>
                    <Switch checked={template.isActive} size="small" disabled />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      aria-label="Edit template"
                      onClick={() => handleOpenEdit(template)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Delete template"
                      onClick={() => setDeleteConfirm(template)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        </TableContainer>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onClose={handleCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingTemplate ? 'Edit Report Template' : 'Create Report Template'}
        </DialogTitle>
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
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={formValues.type}
                label="Type"
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    type: e.target.value as TemplateFormValues['type'],
                  }))
                }
              >
                {TEMPLATE_TYPES.map((t) => (
                  <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Description"
              value={formValues.description}
              onChange={(e) => setFormValues((prev) => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
            <Typography variant="subtitle2">Report Sections</Typography>
            <TextField
              label="Report title"
              value={formValues.templateConfig.title ?? ''}
              helperText="Leave blank to use the template name."
              onChange={(event) =>
                setFormValues((previous) => ({
                  ...previous,
                  templateConfig: {
                    ...previous.templateConfig,
                    title: event.target.value || undefined,
                  },
                }))
              }
            />
            <TextField
              label="Reporting window (hours)"
              type="number"
              value={formValues.templateConfig.lookbackHours ?? 24}
              helperText="A rolling window ending when the report runs; category does not change this window."
              slotProps={{ htmlInput: { min: 1, max: 744 } }}
              onChange={(event) =>
                setFormValues((previous) => ({
                  ...previous,
                  templateConfig: {
                    ...previous.templateConfig,
                    lookbackHours: Number(event.target.value),
                  },
                }))
              }
            />
            <FormGroup>
              {AVAILABLE_SECTIONS.map((section) => (
                <FormControlLabel
                  key={section.key}
                  control={
                    <Checkbox
                      checked={formValues.sections.includes(section.key)}
                      onChange={() => handleSectionToggle(section.key)}
                    />
                  }
                  label={section.label}
                />
              ))}
            </FormGroup>
            {AVAILABLE_SECTIONS.filter((section) => formValues.sections.includes(section.key)).map(
              (section) => {
                const settings = formValues.templateConfig.sections?.find(
                  (item) => item.type === section.key,
                );
                return (
                  <Box key={section.key} sx={{ display: 'grid', gap: 1 }}>
                    <TextField
                      select
                      label={`Machine for ${section.label}`}
                      value={settings?.machineId ?? ''}
                      onChange={(event) =>
                        updateSection(section.key, {
                          machineId: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                    >
                      <MenuItem value="">Use the scheduled machines</MenuItem>
                      {machines.map((machine) => (
                        <MenuItem key={machine.id} value={machine.id}>
                          {machine.name}
                        </MenuItem>
                      ))}
                    </TextField>
                    {section.key === 'trending' && (
                      <TextField
                        label="Trend signals"
                        defaultValue={settings?.nodeKeys?.join(', ') ?? ''}
                        helperText="Mapping names separated by commas, for example PowerConsumption, AirConsumption."
                        onBlur={(event) =>
                          updateSection(section.key, {
                            nodeKeys: event.target.value
                              .split(',')
                              .map((value) => value.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    )}
                  </Box>
                );
              },
            )}
            {formValues.sections.some(
              (type) => !AVAILABLE_SECTIONS.some((section) => section.key === type),
            ) && (
              <Alert severity="warning">
                This template contains legacy sections the report generator cannot render. They
                remain in the saved template and are marked unavailable in the PDF.
              </Alert>
            )}
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
        <DialogTitle>Delete Report Template</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This action cannot be
            undone.
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

export default ReportTemplatesPage;
