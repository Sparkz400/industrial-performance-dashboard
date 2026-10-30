import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageSkeleton from '@/shared/components/loading/PageSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';

interface OeeConfig {
  machineId: number;
  runningModeValues: number[];
  idleModeValues: number[];
  plannedStopModeValues: number[];
  unplannedStopModeValues: number[];
  idealCycleTimeMs: number;
  productionCountNodeKey: string;
  goodCountNodeKey: string;
  rejectCountNodeKey: string;
  manualEntryEnabled: boolean;
  plannedProductionHoursPerDay: number;
}

interface Machine {
  id: number;
  name: string;
}

interface ManualEntryValues {
  date: string;
  productionCount: number | '';
  goodCount: number | '';
  rejectCount: number | '';
  plannedDowntimeMinutes: number | '';
  notes: string;
}

const defaultConfig: OeeConfig = {
  machineId: 0,
  runningModeValues: [],
  idleModeValues: [],
  plannedStopModeValues: [],
  unplannedStopModeValues: [],
  idealCycleTimeMs: 1000,
  productionCountNodeKey: '',
  goodCountNodeKey: '',
  rejectCountNodeKey: '',
  manualEntryEnabled: false,
  plannedProductionHoursPerDay: 24,
};

const defaultManualEntry: ManualEntryValues = {
  date: new Date().toISOString().split('T')[0],
  productionCount: '',
  goodCount: '',
  rejectCount: '',
  plannedDowntimeMinutes: '',
  notes: '',
};

const parseNumberArray = (value: string): number[] =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n));

const formatNumberArray = (arr: number[]): string => arr.join(', ');

const OeeConfigPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [selectedMachineId, setSelectedMachineId] = useState<number | ''>('');
  const [configValues, setConfigValues] = useState<OeeConfig>(defaultConfig);
  const [manualEntry, setManualEntry] = useState<ManualEntryValues>(defaultManualEntry);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [manualEntrySuccess, setManualEntrySuccess] = useState(false);

  // Mode value string states for text field editing
  const [runningStr, setRunningStr] = useState('');
  const [idleStr, setIdleStr] = useState('');
  const [plannedStopStr, setPlannedStopStr] = useState('');
  const [unplannedStopStr, setUnplannedStopStr] = useState('');

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ['machines-oee'],
    queryFn: async () => {
      const res = await protectedFetch(API_ENDPOINTS.machines.base);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery<OeeConfig | null>({
    queryKey: ['oeeConfig', selectedMachineId],
    queryFn: async () => {
      const res = await protectedFetch(API_ENDPOINTS.oee.config(selectedMachineId as number));
      if (!res.ok) throw new Error('Failed to fetch OEE config');
      return res.json();
    },
    enabled: !!selectedMachineId,
  });

  useEffect(() => {
    if (config) {
      setConfigValues(config);
      setRunningStr(formatNumberArray(config.runningModeValues ?? []));
      setIdleStr(formatNumberArray(config.idleModeValues ?? []));
      setPlannedStopStr(formatNumberArray(config.plannedStopModeValues ?? []));
      setUnplannedStopStr(formatNumberArray(config.unplannedStopModeValues ?? []));
    } else if (selectedMachineId) {
      setConfigValues({ ...defaultConfig, machineId: selectedMachineId as number });
      setRunningStr('');
      setIdleStr('');
      setPlannedStopStr('');
      setUnplannedStopStr('');
    }
  }, [config, selectedMachineId]);

  const saveMutation = useMutation({
    mutationFn: async (values: OeeConfig) => {
      const res = await protectedFetch(API_ENDPOINTS.oee.config(values.machineId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to save OEE config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oeeConfig'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const manualEntryMutation = useMutation({
    mutationFn: async (values: ManualEntryValues & { machineId: number }) => {
      const res = await protectedFetch(API_ENDPOINTS.oee.manualEntry(values.machineId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to submit manual entry');
      return res.json();
    },
    onSuccess: () => {
      setManualEntry(defaultManualEntry);
      setManualEntrySuccess(true);
      setTimeout(() => setManualEntrySuccess(false), 3000);
    },
  });

  const handleSave = useCallback(() => {
    const values: OeeConfig = {
      ...configValues,
      machineId: selectedMachineId as number,
      runningModeValues: parseNumberArray(runningStr),
      idleModeValues: parseNumberArray(idleStr),
      plannedStopModeValues: parseNumberArray(plannedStopStr),
      unplannedStopModeValues: parseNumberArray(unplannedStopStr),
    };
    saveMutation.mutate(values);
  }, [
    configValues,
    selectedMachineId,
    runningStr,
    idleStr,
    plannedStopStr,
    unplannedStopStr,
    saveMutation,
  ]);

  const handleManualEntrySubmit = useCallback(() => {
    if (!selectedMachineId) return;
    manualEntryMutation.mutate({
      ...manualEntry,
      machineId: selectedMachineId as number,
    });
  }, [manualEntry, selectedMachineId, manualEntryMutation]);

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
            OEE Configuration
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            Configure OEE calculation parameters per machine
          </Typography>
        </Box>
        {selectedMachineId && (
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
        )}
      </Box>

      {(error || saveMutation.error || manualEntryMutation.error) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error)?.message ||
            (saveMutation.error as Error)?.message ||
            (manualEntryMutation.error as Error)?.message}
        </Alert>
      )}

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          OEE configuration saved successfully.
        </Alert>
      )}

      {/* Machine selector */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FormControl fullWidth>
          <InputLabel>Select Machine</InputLabel>
          <Select
            value={selectedMachineId}
            label="Select Machine"
            onChange={(e) => setSelectedMachineId(e.target.value as number)}
          >
            <MenuItem value="">
              <em>Select a machine</em>
            </MenuItem>
            {machines.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      {!selectedMachineId ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography
            variant="h6"
            sx={{
              color: 'text.secondary',
            }}
          >
            Select a machine to configure OEE parameters
          </Typography>
        </Box>
      ) : isLoading ? (
        <PageSkeleton variant="cards" count={2} />
      ) : (
        <>
          {/* OEE Configuration form */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Mode Values
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Running Mode Values (comma-separated)"
                value={runningStr}
                onChange={(e) => setRunningStr(e.target.value)}
                fullWidth
                placeholder="1, 2, 3"
                helperText="Operation mode values that indicate the machine is running"
              />
              <TextField
                label="Idle Mode Values (comma-separated)"
                value={idleStr}
                onChange={(e) => setIdleStr(e.target.value)}
                fullWidth
                placeholder="0, 10"
                helperText="Operation mode values that indicate the machine is idle"
              />
              <TextField
                label="Planned Stop Mode Values (comma-separated)"
                value={plannedStopStr}
                onChange={(e) => setPlannedStopStr(e.target.value)}
                fullWidth
                placeholder="5, 6"
                helperText="Operation mode values for planned stops (maintenance, changeover)"
              />
              <TextField
                label="Unplanned Stop Mode Values (comma-separated)"
                value={unplannedStopStr}
                onChange={(e) => setUnplannedStopStr(e.target.value)}
                fullWidth
                placeholder="7, 8, 9"
                helperText="Operation mode values for unplanned stops (faults, breakdowns)"
              />
            </Box>

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" gutterBottom>
              Performance Parameters
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Ideal Cycle Time (ms)"
                type="number"
                value={configValues.idealCycleTimeMs}
                onChange={(e) =>
                  setConfigValues((prev) => ({
                    ...prev,
                    idealCycleTimeMs: Number(e.target.value),
                  }))
                }
                fullWidth
              />
              <TextField
                label="Production Count Node Key"
                value={configValues.productionCountNodeKey}
                onChange={(e) =>
                  setConfigValues((prev) => ({
                    ...prev,
                    productionCountNodeKey: e.target.value,
                  }))
                }
                fullWidth
                placeholder="e.g., ns=2;s=ProductionCount"
              />
              <TextField
                label="Good Count Node Key"
                value={configValues.goodCountNodeKey}
                onChange={(e) =>
                  setConfigValues((prev) => ({
                    ...prev,
                    goodCountNodeKey: e.target.value,
                  }))
                }
                fullWidth
                placeholder="e.g., ns=2;s=GoodCount"
              />
              <TextField
                label="Reject Count Node Key"
                value={configValues.rejectCountNodeKey}
                onChange={(e) =>
                  setConfigValues((prev) => ({
                    ...prev,
                    rejectCountNodeKey: e.target.value,
                  }))
                }
                fullWidth
                placeholder="e.g., ns=2;s=RejectCount"
              />
              <TextField
                label="Planned Production Hours Per Day"
                type="number"
                value={configValues.plannedProductionHoursPerDay}
                onChange={(e) =>
                  setConfigValues((prev) => ({
                    ...prev,
                    plannedProductionHoursPerDay: Number(e.target.value),
                  }))
                }
                fullWidth
                slotProps={{
                  htmlInput: { min: 1, max: 24 },
                }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={configValues.manualEntryEnabled}
                    onChange={(e) =>
                      setConfigValues((prev) => ({
                        ...prev,
                        manualEntryEnabled: e.target.checked,
                      }))
                    }
                  />
                }
                label="Enable Manual Entry"
              />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                Save Configuration
              </Button>
            </Box>
          </Paper>

          {/* Manual Entry form */}
          {configValues.manualEntryEnabled && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Manual OEE Entry
              </Typography>

              {manualEntrySuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Manual entry submitted successfully.
                </Alert>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Date"
                  type="date"
                  value={manualEntry.date}
                  onChange={(e) => setManualEntry((prev) => ({ ...prev, date: e.target.value }))}
                  fullWidth
                  slotProps={{
                    inputLabel: { shrink: true },
                  }}
                />
                <TextField
                  label="Production Count"
                  type="number"
                  value={manualEntry.productionCount}
                  onChange={(e) =>
                    setManualEntry((prev) => ({
                      ...prev,
                      productionCount: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  fullWidth
                />
                <TextField
                  label="Good Count"
                  type="number"
                  value={manualEntry.goodCount}
                  onChange={(e) =>
                    setManualEntry((prev) => ({
                      ...prev,
                      goodCount: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  fullWidth
                />
                <TextField
                  label="Reject Count"
                  type="number"
                  value={manualEntry.rejectCount}
                  onChange={(e) =>
                    setManualEntry((prev) => ({
                      ...prev,
                      rejectCount: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  fullWidth
                />
                <TextField
                  label="Planned Downtime (minutes)"
                  type="number"
                  value={manualEntry.plannedDowntimeMinutes}
                  onChange={(e) =>
                    setManualEntry((prev) => ({
                      ...prev,
                      plannedDowntimeMinutes: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  fullWidth
                />
                <TextField
                  label="Notes"
                  value={manualEntry.notes}
                  onChange={(e) => setManualEntry((prev) => ({ ...prev, notes: e.target.value }))}
                  fullWidth
                  multiline
                  rows={3}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    onClick={handleManualEntrySubmit}
                    disabled={manualEntryMutation.isPending}
                  >
                    Submit Manual Entry
                  </Button>
                </Box>
              </Box>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
};

export default OeeConfigPage;
