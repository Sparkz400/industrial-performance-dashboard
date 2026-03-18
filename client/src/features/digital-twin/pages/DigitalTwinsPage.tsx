import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Tabs,
  Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useNavigate } from 'react-router-dom';
import {
  useTwinTemplates,
  useTwinTemplate,
  useCreateTwinTemplate,
  useUpdateTwinTemplate,
  useDeleteTwinTemplate,
  useTwinInstances,
  useCreateTwinInstance,
  useUpdateTwinInstance,
  useDeleteTwinInstance,
  type TwinTemplate,
  type TwinInstance,
  type TwinElementDefinition,
  type TwinNodeBinding,
  type CreateTwinTemplateRequest,
  type CreateTwinInstanceRequest,
  type UpdateTwinInstanceRequest,
} from '../hooks/useDigitalTwinQueries';
import { useMachineStore } from '@/stores/useMachineStore';

// ── Template form types ─────────────────────────────────────────────────────

interface TemplateForm {
  name: string;
  description: string;
  category: string;
  svgContent: string;
  elements: TwinElementDefinition[];
}

const emptyTemplateForm: TemplateForm = {
  name: '',
  description: '',
  category: 'general',
  svgContent: '',
  elements: [],
};

const emptyElement: TwinElementDefinition = {
  id: '',
  name: '',
  type: 'sensor',
  svgElementId: '',
  unit: '',
};

// ── Instance form types ─────────────────────────────────────────────────────

interface InstanceForm {
  name: string;
  templateId: number;
  machineId: number;
  bindings: TwinNodeBinding[];
}

const emptyInstanceForm: InstanceForm = {
  name: '',
  templateId: 0,
  machineId: 0,
  bindings: [],
};

const emptyBinding: TwinNodeBinding = {
  elementId: '',
  nodeKey: '',
  label: '',
  unit: '',
};

// ── Element Types ───────────────────────────────────────────────────────────

const ELEMENT_TYPES = [
  { value: 'sensor', label: 'Sensor' },
  { value: 'actuator', label: 'Actuator' },
  { value: 'indicator', label: 'Indicator' },
  { value: 'zone', label: 'Zone' },
];

// ── Component ───────────────────────────────────────────────────────────────

const DigitalTwinsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

  // ── Template state ──────────────────────────────────────────────────────
  const { data: templates, isLoading: templatesLoading, error: templatesError } = useTwinTemplates();
  const createTemplate = useCreateTwinTemplate();
  const updateTemplate = useUpdateTwinTemplate();
  const deleteTemplate = useDeleteTwinTemplate();

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TwinTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<TwinTemplate | null>(null);
  const [loadingTemplateId, setLoadingTemplateId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When editing, fetch full template (with svgContent) since list omits it
  const { data: fullTemplate } = useTwinTemplate(loadingTemplateId ?? 0);

  useEffect(() => {
    if (fullTemplate && loadingTemplateId) {
      setTemplateForm({
        name: fullTemplate.name,
        description: fullTemplate.description || '',
        category: 'general',
        svgContent: fullTemplate.svgContent || '',
        elements: fullTemplate.elements || [],
      });
      setLoadingTemplateId(null);
      setTemplateDialogOpen(true);
    }
  }, [fullTemplate, loadingTemplateId]);

  // ── Instance state ──────────────────────────────────────────────────────
  const { data: instances, isLoading: instancesLoading, error: instancesError } = useTwinInstances();
  const createInstance = useCreateTwinInstance();
  const updateInstance = useUpdateTwinInstance();
  const deleteInstance = useDeleteTwinInstance();

  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<TwinInstance | null>(null);
  const [instanceForm, setInstanceForm] = useState<InstanceForm>(emptyInstanceForm);
  const [deleteInstanceTarget, setDeleteInstanceTarget] = useState<TwinInstance | null>(null);

  // ── Machines ────────────────────────────────────────────────────────────
  const machines = useMachineStore((s) => s.machines);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);

  const machineNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of machines) {
      map.set(m.id, m.name);
    }
    return map;
  }, [machines]);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  // ── Template handlers ───────────────────────────────────────────────────

  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    setTemplateDialogOpen(true);
  };

  const handleOpenEditTemplate = (template: TwinTemplate) => {
    setEditingTemplate(template);
    setLoadingTemplateId(template.id);
  };

  const handleSvgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setTemplateForm((f) => ({ ...f, svgContent: content }));
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const handleAddElement = () => {
    setTemplateForm((f) => ({
      ...f,
      elements: [...f.elements, { ...emptyElement, id: crypto.randomUUID() }],
    }));
  };

  const handleRemoveElement = (index: number) => {
    setTemplateForm((f) => ({
      ...f,
      elements: f.elements.filter((_, i) => i !== index),
    }));
  };

  const handleElementChange = (index: number, field: keyof TwinElementDefinition, value: string) => {
    setTemplateForm((f) => ({
      ...f,
      elements: f.elements.map((el, i) => (i === index ? { ...el, [field]: value } : el)),
    }));
  };

  const handleSubmitTemplate = () => {
    const payload: CreateTwinTemplateRequest = {
      name: templateForm.name,
      description: templateForm.description || undefined,
      svgContent: templateForm.svgContent,
      elements: templateForm.elements,
    };

    if (editingTemplate) {
      updateTemplate.mutate(
        { id: editingTemplate.id, ...payload },
        { onSuccess: () => setTemplateDialogOpen(false) },
      );
    } else {
      createTemplate.mutate(payload, {
        onSuccess: () => setTemplateDialogOpen(false),
      });
    }
  };

  const handleDeleteTemplate = () => {
    if (!deleteTemplateTarget) return;
    deleteTemplate.mutate(deleteTemplateTarget.id, {
      onSuccess: () => setDeleteTemplateTarget(null),
    });
  };

  // ── Instance handlers ───────────────────────────────────────────────────

  const handleOpenCreateInstance = () => {
    setEditingInstance(null);
    setInstanceForm(emptyInstanceForm);
    setInstanceDialogOpen(true);
  };

  const handleOpenEditInstance = (instance: TwinInstance) => {
    setEditingInstance(instance);
    setInstanceForm({
      name: instance.name,
      templateId: instance.templateId,
      machineId: instance.machineId,
      bindings: instance.bindings || [],
    });
    setInstanceDialogOpen(true);
  };

  const handleAddBinding = () => {
    setInstanceForm((f) => ({
      ...f,
      bindings: [...f.bindings, { ...emptyBinding }],
    }));
  };

  const handleRemoveBinding = (index: number) => {
    setInstanceForm((f) => ({
      ...f,
      bindings: f.bindings.filter((_, i) => i !== index),
    }));
  };

  const handleBindingChange = (index: number, field: keyof TwinNodeBinding, value: string) => {
    setInstanceForm((f) => ({
      ...f,
      bindings: f.bindings.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    }));
  };

  const handleSubmitInstance = () => {
    if (editingInstance) {
      const payload: UpdateTwinInstanceRequest & { id: number } = {
        id: editingInstance.id,
        name: instanceForm.name,
        bindings: instanceForm.bindings,
      };
      updateInstance.mutate(payload, {
        onSuccess: () => setInstanceDialogOpen(false),
      });
    } else {
      const payload: CreateTwinInstanceRequest = {
        name: instanceForm.name,
        templateId: instanceForm.templateId,
        machineId: instanceForm.machineId,
        bindings: instanceForm.bindings,
      };
      createInstance.mutate(payload, {
        onSuccess: () => setInstanceDialogOpen(false),
      });
    }
  };

  const handleDeleteInstance = () => {
    if (!deleteInstanceTarget) return;
    deleteInstance.mutate(deleteInstanceTarget.id, {
      onSuccess: () => setDeleteInstanceTarget(null),
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Digital Twins</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={activeTab === 0 ? handleOpenCreateTemplate : handleOpenCreateInstance}
        >
          {activeTab === 0 ? 'Create Template' : 'Create Instance'}
        </Button>
      </Stack>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="Templates" />
        <Tab label="Instances" />
      </Tabs>

      {/* ── Templates Tab ──────────────────────────────────────────────── */}
      {activeTab === 0 && (
        <>
          {templatesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load templates: {(templatesError as Error).message}
            </Alert>
          )}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Elements</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {templatesLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : templates && templates.length > 0 ? (
                  templates.map((tpl) => (
                    <TableRow key={tpl.id} hover>
                      <TableCell>
                        <Typography fontWeight={500}>{tpl.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={tpl.category || 'general'} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                          {tpl.description || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>{tpl.elements?.length ?? 0}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(tpl.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleOpenEditTemplate(tpl)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteTemplateTarget(tpl)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No templates yet. Create one to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ── Instances Tab ──────────────────────────────────────────────── */}
      {activeTab === 1 && (
        <>
          {instancesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load instances: {(instancesError as Error).message}
            </Alert>
          )}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Template</TableCell>
                  <TableCell>Machine</TableCell>
                  <TableCell>Bindings</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {instancesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : instances && instances.length > 0 ? (
                  instances.map((inst) => (
                    <TableRow key={inst.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/digital-twins/${inst.id}`)}>
                      <TableCell>
                        <Typography fontWeight={500}>{inst.name}</Typography>
                      </TableCell>
                      <TableCell>{inst.templateName || `Template #${inst.templateId}`}</TableCell>
                      <TableCell>
                        {inst.machineName ||
                          machineNameById.get(inst.machineId) ||
                          `Machine #${inst.machineId}`}
                      </TableCell>
                      <TableCell>{inst.bindings?.length ?? 0}</TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Live View">
                          <IconButton size="small" onClick={() => navigate(`/digital-twins/${inst.id}`)}>
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleOpenEditInstance(inst)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteInstanceTarget(inst)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No instances yet. Create a template first, then create an instance.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ── Template Create/Edit Dialog ────────────────────────────────── */}
      <Dialog
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Template Name"
              value={templateForm.name}
              onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={templateForm.description}
              onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              label="Category"
              value={templateForm.category}
              onChange={(e) => setTemplateForm((f) => ({ ...f, category: e.target.value }))}
              fullWidth
            />

            {/* SVG Upload */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">SVG Content</Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload SVG File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".svg"
                  hidden
                  onChange={handleSvgFileUpload}
                />
              </Stack>
              {templateForm.svgContent ? (
                <Alert severity="success" sx={{ mb: 1 }}>
                  SVG loaded ({templateForm.svgContent.length.toLocaleString()} characters)
                </Alert>
              ) : (
                <Alert severity="info" sx={{ mb: 1 }}>
                  Upload an SVG file or paste SVG content below
                </Alert>
              )}
              <TextField
                value={templateForm.svgContent}
                onChange={(e) => setTemplateForm((f) => ({ ...f, svgContent: e.target.value }))}
                fullWidth
                multiline
                rows={4}
                placeholder="<svg>...</svg>"
                sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
              />
            </Box>

            {/* Element Mappings */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Element Mappings</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={handleAddElement}>
                  Add Element
                </Button>
              </Stack>
              {templateForm.elements.map((el, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  <TextField
                    label="SVG Element ID"
                    value={el.svgElementId}
                    onChange={(e) => handleElementChange(i, 'svgElementId', e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Label"
                    value={el.name}
                    onChange={(e) => handleElementChange(i, 'name', e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    select
                    label="Type"
                    value={el.type}
                    onChange={(e) => handleElementChange(i, 'type', e.target.value)}
                    size="small"
                    sx={{ width: 130 }}
                  >
                    {ELEMENT_TYPES.map((t) => (
                      <MenuItem key={t.value} value={t.value}>
                        {t.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Unit"
                    value={el.unit || ''}
                    onChange={(e) => handleElementChange(i, 'unit', e.target.value)}
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <IconButton size="small" color="error" onClick={() => handleRemoveElement(i)}>
                    <RemoveCircleOutlineIcon />
                  </IconButton>
                </Stack>
              ))}
              {templateForm.elements.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No elements defined. Add elements to map SVG element IDs to data points.
                </Typography>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmitTemplate}
            variant="contained"
            disabled={
              !templateForm.name ||
              !templateForm.svgContent ||
              createTemplate.isPending ||
              updateTemplate.isPending
            }
          >
            {editingTemplate ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Template Delete Confirmation ───────────────────────────────── */}
      <Dialog open={!!deleteTemplateTarget} onClose={() => setDeleteTemplateTarget(null)}>
        <DialogTitle>Delete Template</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the template{' '}
            <strong>{deleteTemplateTarget?.name}</strong>? All instances using this template will also
            be deleted. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTemplateTarget(null)}>Cancel</Button>
          <Button
            onClick={handleDeleteTemplate}
            variant="contained"
            color="error"
            disabled={deleteTemplate.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Instance Create/Edit Dialog ────────────────────────────────── */}
      <Dialog
        open={instanceDialogOpen}
        onClose={() => setInstanceDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingInstance ? 'Edit Instance' : 'Create Instance'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Instance Name"
              value={instanceForm.name}
              onChange={(e) => setInstanceForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              select
              label="Template"
              value={instanceForm.templateId || ''}
              onChange={(e) =>
                setInstanceForm((f) => ({ ...f, templateId: Number(e.target.value) }))
              }
              fullWidth
              required
              disabled={!!editingInstance}
            >
              <MenuItem value="">Select a template</MenuItem>
              {templates?.map((tpl) => (
                <MenuItem key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Machine"
              value={instanceForm.machineId || ''}
              onChange={(e) =>
                setInstanceForm((f) => ({ ...f, machineId: Number(e.target.value) }))
              }
              fullWidth
              required
              disabled={!!editingInstance}
            >
              <MenuItem value="">Select a machine</MenuItem>
              {machines.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name}
                </MenuItem>
              ))}
            </TextField>

            {/* Node Bindings */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Node Bindings</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={handleAddBinding}>
                  Add Binding
                </Button>
              </Stack>
              {instanceForm.bindings.map((binding, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  <TextField
                    label="SVG Element ID"
                    value={binding.elementId}
                    onChange={(e) => handleBindingChange(i, 'elementId', e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Node Key"
                    value={binding.nodeKey}
                    onChange={(e) => handleBindingChange(i, 'nodeKey', e.target.value)}
                    size="small"
                    placeholder="ns=2;s=Temperature"
                    sx={{ flex: 1.5 }}
                  />
                  <TextField
                    label="Display Label"
                    value={binding.label}
                    onChange={(e) => handleBindingChange(i, 'label', e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Unit"
                    value={binding.unit || ''}
                    onChange={(e) => handleBindingChange(i, 'unit', e.target.value)}
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <IconButton size="small" color="error" onClick={() => handleRemoveBinding(i)}>
                    <RemoveCircleOutlineIcon />
                  </IconButton>
                </Stack>
              ))}
              {instanceForm.bindings.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No bindings configured. Add bindings to connect SVG elements to OPC UA nodes.
                </Typography>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInstanceDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmitInstance}
            variant="contained"
            disabled={
              !instanceForm.name ||
              !instanceForm.templateId ||
              !instanceForm.machineId ||
              createInstance.isPending ||
              updateInstance.isPending
            }
          >
            {editingInstance ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Instance Delete Confirmation ───────────────────────────────── */}
      <Dialog open={!!deleteInstanceTarget} onClose={() => setDeleteInstanceTarget(null)}>
        <DialogTitle>Delete Instance</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the instance{' '}
            <strong>{deleteInstanceTarget?.name}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteInstanceTarget(null)}>Cancel</Button>
          <Button
            onClick={handleDeleteInstance}
            variant="contained"
            color="error"
            disabled={deleteInstance.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DigitalTwinsPage;
