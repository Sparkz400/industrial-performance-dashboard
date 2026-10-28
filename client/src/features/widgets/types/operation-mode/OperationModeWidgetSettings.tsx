import React, { useEffect } from 'react';
import {
  Box,
  Typography,
  Slider,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { useMachineStore } from '@/stores/useMachineStore';
import type { WidgetConfig } from '@/types';

interface OperationModeWidgetSettingsProps {
  config?: WidgetConfig;
  onConfigChange: (newConfig: WidgetConfig) => void;
}

/**
 * Settings component for Operation Mode Widget
 * @param root0
 * @param root0.config
 * @param root0.onConfigChange
 */
const OperationModeWidgetSettings: React.FC<OperationModeWidgetSettingsProps> = ({
  config,
  onConfigChange,
}) => {
  const maxPoints = ((config || {}).maxPoints as number) ?? 120;
  const showBrush = ((config || {}).showBrush as boolean) ?? true;
  const machineId = String((config || {}).machineId ?? '');
  const machines = useMachineStore((s) => s.machines);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);

  useEffect(() => {
    if (machines.length === 0) fetchMachines();
  }, [machines.length, fetchMachines]);

  const handleMaxPointsChange = (_: Event, newValue: number | number[]) => {
    onConfigChange({ ...config, maxPoints: newValue as number });
  };

  const handleShowBrushChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, showBrush: event.target.checked });
  };

  const handleMachineChange = (
    event:
      React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: string } },
  ) => {
    const value = event.target.value;
    onConfigChange({ ...config, machineId: value === '' ? undefined : Number(value) });
  };

  return (
    <Box sx={{ p: 2 }}>
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel>Machine</InputLabel>
        <Select value={machineId} label="Machine" onChange={handleMachineChange}>
          <MenuItem value="">Select a machine</MenuItem>
          {machines.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.name} ({m.ip})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="subtitle1" gutterBottom>
        Data Points
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Maximum number of data points to display: {maxPoints}
      </Typography>
      <Slider
        value={maxPoints}
        onChange={handleMaxPointsChange}
        min={20}
        max={1000}
        step={20}
        marks={[
          { value: 20, label: '20' },
          { value: 500, label: '500' },
          { value: 1000, label: '1000' },
        ]}
        sx={{ mb: 3 }}
      />

      <FormControlLabel
        control={<Switch checked={showBrush} onChange={handleShowBrushChange} />}
        label="Show time range selector"
      />
    </Box>
  );
};

export default OperationModeWidgetSettings;
