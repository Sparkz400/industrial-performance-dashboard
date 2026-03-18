import React, { useEffect } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useMachineStore } from '@/stores/useMachineStore';
import TagSelector from './components/TagSelector';
import type { WidgetConfig } from '@/types';

interface TrendingExplorerWidgetSettingsProps {
  config?: WidgetConfig;
  onConfigChange: (newConfig: WidgetConfig) => void;
}

const TrendingExplorerWidgetSettings: React.FC<TrendingExplorerWidgetSettingsProps> = ({
  config,
  onConfigChange,
}) => {
  const machineId = String((config || {}).machineId ?? '');
  const defaultTags = ((config || {}).defaultTags as string[]) ?? [];
  const machines = useMachineStore((s) => s.machines);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);

  useEffect(() => {
    if (machines.length === 0) fetchMachines();
  }, [machines.length, fetchMachines]);

  const handleMachineChange = (
    event:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      | { target: { value: string } },
  ) => {
    const value = event.target.value;
    onConfigChange({
      ...config,
      machineId: value === '' ? undefined : Number(value),
      defaultTags: [],
    });
  };

  const handleTagsChange = (tags: string[]) => {
    onConfigChange({ ...config, defaultTags: tags });
  };

  const numericMachineId = machineId ? Number(machineId) : null;

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <FormControl fullWidth>
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

      <TagSelector
        machineId={numericMachineId}
        selectedTags={defaultTags}
        onTagsChange={handleTagsChange}
      />
    </Box>
  );
};

export default TrendingExplorerWidgetSettings;
