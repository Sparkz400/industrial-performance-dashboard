import ResponsiveTable from '@/shared/components/ResponsiveTable';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  IconButton,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  Alert,
  Tabs,
  Tab,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import { useMachineStore } from '@/stores/useMachineStore';
import NodeBrowser from './NodeBrowser';
import type { Machine, NodeMapping, BrowsedNode } from '@/types';

interface NodeMappingEditorProps {
  open: boolean;
  onClose: () => void;
  machine: Machine | null;
}

interface EditableMapping {
  id?: number;
  nodeId: string;
  nodeKey: string;
  displayName: string;
  dataType: string;
  samplingInterval: number;
  isActive: boolean;
  isNew?: boolean;
}

const NodeMappingEditor: React.FC<NodeMappingEditorProps> = ({ open, onClose, machine }) => {
  const [tab, setTab] = useState(0);
  const [mappings, setMappings] = useState<EditableMapping[]>([]);
  const [selectedBrowseNodes, setSelectedBrowseNodes] = useState<BrowsedNode[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getMappings = useMachineStore((s) => s.getMappings);
  const saveMappings = useMachineStore((s) => s.saveMappings);
  const deleteMapping = useMachineStore((s) => s.deleteMapping);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);

  const loadMappings = useCallback(async () => {
    if (!machine) return;
    try {
      const existing = await getMappings(machine.id);
      setMappings(existing.map((m: NodeMapping) => ({ ...m })));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [machine, getMappings]);

  useEffect(() => {
    if (open && machine) {
      loadMappings();
      setSelectedBrowseNodes([]);
      setError(null);
      setSuccess(null);
      setTab(0);
    }
  }, [open, machine, loadMappings]);

  const handleToggleBrowseNode = (node: BrowsedNode) => {
    setSelectedBrowseNodes((prev) => {
      const exists = prev.some((n) => n.nodeId === node.nodeId);
      if (exists) return prev.filter((n) => n.nodeId !== node.nodeId);
      return [...prev, node];
    });
  };

  const handleAddSelectedNodes = () => {
    const newMappings: EditableMapping[] = selectedBrowseNodes
      .filter((node) => !mappings.some((m) => m.nodeId === node.nodeId))
      .map((node) => ({
        nodeId: node.nodeId,
        nodeKey: node.displayName.replace(/[^a-zA-Z0-9_]/g, ''),
        displayName: node.displayName,
        dataType: 'Double',
        samplingInterval: 500,
        isActive: true,
        isNew: true,
      }));

    if (newMappings.length === 0) {
      setError('Selected nodes are already mapped');
      return;
    }

    setMappings((prev) => [...prev, ...newMappings]);
    setSelectedBrowseNodes([]);
    setTab(0);
    setSuccess(`Added ${newMappings.length} node(s). Click Save to persist.`);
  };

  const handleUpdateMapping = (
    index: number,
    field: keyof EditableMapping,
    value: EditableMapping[keyof EditableMapping],
  ) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const handleDeleteMapping = async (index: number) => {
    // eslint-disable-next-line security/detect-object-injection -- index is a numeric parameter from the caller
    const mapping = mappings[index];
    if (mapping.id && machine) {
      try {
        await deleteMapping(machine.id, mapping.id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return;
      }
    }
    setMappings((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!machine) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await saveMappings(machine.id, mappings);
      setSuccess('Mappings saved successfully. Connection will refresh to apply changes.');
      await fetchMachines();
      await loadMappings();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddManual = () => {
    setMappings((prev) => [
      ...prev,
      {
        nodeId: '',
        nodeKey: '',
        displayName: '',
        dataType: 'Double',
        samplingInterval: 500,
        isActive: true,
        isNew: true,
      },
    ]);
  };

  if (!machine) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Node Mappings — {machine.name}
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            overflowWrap: 'anywhere',
          }}
        >
          {machine.endpointUrl}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Tabs
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 2 }}
        >
          <Tab label={`Current Mappings (${mappings.length})`} />
          <Tab label="Browse & Add Nodes" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
              <Button startIcon={<AddIcon />} size="small" onClick={handleAddManual}>
                Add Manual Entry
              </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <ResponsiveTable
                labels={[
                  'Node ID',
                  'Key',
                  'Display Name',
                  'Data Type',
                  'Interval (ms)',
                  'Active',
                  'Actions',
                ]}
                size="small"
                stickyHeader
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Node ID</TableCell>
                    <TableCell>Key</TableCell>
                    <TableCell>Display Name</TableCell>
                    <TableCell>Data Type</TableCell>
                    <TableCell sx={{ width: 100 }}>Interval (ms)</TableCell>
                    <TableCell sx={{ width: 70 }}>Active</TableCell>
                    <TableCell sx={{ width: 50 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mappings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'text.secondary',
                            overflowWrap: 'anywhere',
                            py: 2,
                          }}
                        >
                          No mappings yet. Browse nodes or add manually.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    mappings.map((mapping, index) => (
                      <TableRow key={mapping.id || `new-${index}`}>
                        <TableCell>
                          <TextField
                            slotProps={{ htmlInput: { 'aria-label': `Node ID ${index + 1}` } }}
                            value={mapping.nodeId}
                            onChange={(e) => handleUpdateMapping(index, 'nodeId', e.target.value)}
                            size="small"
                            variant="standard"
                            fullWidth
                            placeholder="ns=1;s=NodeName"
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            slotProps={{ htmlInput: { 'aria-label': `Key ${index + 1}` } }}
                            value={mapping.nodeKey}
                            onChange={(e) => handleUpdateMapping(index, 'nodeKey', e.target.value)}
                            size="small"
                            variant="standard"
                            fullWidth
                            placeholder="UniqueKey"
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            slotProps={{ htmlInput: { 'aria-label': `Display Name ${index + 1}` } }}
                            value={mapping.displayName}
                            onChange={(e) =>
                              handleUpdateMapping(index, 'displayName', e.target.value)
                            }
                            size="small"
                            variant="standard"
                            fullWidth
                            placeholder="Display Name"
                          />
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" variant="standard" fullWidth>
                            <Select
                              inputProps={{ 'aria-label': `Data Type ${index + 1}` }}
                              value={mapping.dataType}
                              onChange={(e) =>
                                handleUpdateMapping(index, 'dataType', e.target.value)
                              }
                            >
                              <MenuItem value="Double">Double</MenuItem>
                              <MenuItem value="Float">Float</MenuItem>
                              <MenuItem value="Int32">Int32</MenuItem>
                              <MenuItem value="Int64">Int64</MenuItem>
                              <MenuItem value="UInt32">UInt32</MenuItem>
                              <MenuItem value="Boolean">Boolean</MenuItem>
                              <MenuItem value="String">String</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            value={mapping.samplingInterval}
                            onChange={(e) =>
                              handleUpdateMapping(
                                index,
                                'samplingInterval',
                                parseInt(e.target.value, 10),
                              )
                            }
                            size="small"
                            variant="standard"
                            slotProps={{
                              htmlInput: {
                                min: 100,
                                step: 100,
                                'aria-label': `Interval (ms) ${index + 1}`,
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            slotProps={{ input: { 'aria-label': `Active ${index + 1}` } }}
                            checked={mapping.isActive}
                            onChange={(e) =>
                              handleUpdateMapping(index, 'isActive', e.target.checked)
                            }
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Remove">
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteMapping(index)}
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </ResponsiveTable>
            </TableContainer>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <NodeBrowser
              machineId={machine.id}
              selectedNodes={selectedBrowseNodes}
              onToggleNode={handleToggleBrowseNode}
            />
            {selectedBrowseNodes.length > 0 && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleAddSelectedNodes}
                >
                  Add {selectedBrowseNodes.length} Selected Node(s) to Mappings
                </Button>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={saving || mappings.length === 0}
        >
          {saving ? 'Saving...' : 'Save Mappings'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NodeMappingEditor;
