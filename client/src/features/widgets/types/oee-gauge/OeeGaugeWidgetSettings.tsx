import React, { useEffect } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useMachineStore } from '@/stores/useMachineStore';
import type { WidgetConfig } from '@/types';

interface OeeGaugeWidgetSettingsProps {
  config?: WidgetConfig;
  onConfigChange: (newConfig: WidgetConfig) => void;
}

const OeeGaugeWidgetSettings: React.FC<OeeGaugeWidgetSettingsProps> = ({
  config,
  onConfigChange,
}) => {
  const { machineId = '' } = config || {};
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
    onConfigChange({ ...config, machineId: value === '' ? undefined : Number(value) });
  };

  return (
    <Box sx={{ p: 2 }}>
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
    </Box>
  );
};

export default OeeGaugeWidgetSettings;
