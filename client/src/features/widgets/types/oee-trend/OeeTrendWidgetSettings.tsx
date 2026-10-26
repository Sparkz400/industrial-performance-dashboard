import React, { useEffect } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useMachineStore } from '@/stores/useMachineStore';
import type { WidgetConfig } from '@/types';
import type { Granularity } from './useOeeTrendData';

interface OeeTrendWidgetSettingsProps {
  config?: WidgetConfig;
  onConfigChange: (newConfig: WidgetConfig) => void;
}

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
];

const OeeTrendWidgetSettings: React.FC<OeeTrendWidgetSettingsProps> = ({
  config,
  onConfigChange,
}) => {
  const machineId = String((config || {}).machineId ?? '');
  const granularity = ((config || {}).granularity as string) ?? 'day';
  const machines = useMachineStore((s) => s.machines);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);

  useEffect(() => {
    if (machines.length === 0) fetchMachines();
  }, [machines.length, fetchMachines]);

  const handleMachineChange = (
    event:
      React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: string } },
  ) => {
    const value = event.target.value;
    onConfigChange({ ...config, machineId: value === '' ? undefined : Number(value) });
  };

  const handleGranularityChange = (
    event:
      React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: string } },
  ) => {
    onConfigChange({ ...config, granularity: event.target.value });
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

      <FormControl fullWidth>
        <InputLabel>Granularity</InputLabel>
        <Select value={granularity} label="Granularity" onChange={handleGranularityChange}>
          {GRANULARITY_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};

export default OeeTrendWidgetSettings;
