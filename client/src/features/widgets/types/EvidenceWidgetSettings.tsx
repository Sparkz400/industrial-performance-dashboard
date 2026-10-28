import React, { useEffect } from 'react';
import { Box, MenuItem, TextField } from '@mui/material';
import { useMachineStore } from '@/stores/useMachineStore';
import type { WidgetConfig } from '@/types';
import { useT } from '@/i18n';
/**
 * Select a machine without combining unrelated sources.
 * @param root0 Widget settings.
 * @param root0.config Saved configuration.
 * @param root0.onConfigChange Configuration callback.
 */
export default function EvidenceWidgetSettings({
  config = {},
  onConfigChange,
}: {
  config?: WidgetConfig;
  onConfigChange: (config: WidgetConfig) => void;
}) {
  const machines = useMachineStore((s) => s.machines),
    fetchMachines = useMachineStore((s) => s.fetchMachines),
    t = useT();
  useEffect(() => {
    void fetchMachines();
  }, [fetchMachines]);
  return (
    <Box sx={{ p: 2 }}>
      <TextField
        select
        fullWidth
        label={t('Machine', 'Maschine')}
        value={config.machineId ?? ''}
        onChange={(e) =>
          onConfigChange({
            ...config,
            machineId: e.target.value === '' ? undefined : Number(e.target.value),
          })
        }
      >
        <MenuItem value="">{t('Select a machine', 'Maschine auswählen')}</MenuItem>
        {machines.map((machine) => (
          <MenuItem key={machine.id} value={machine.id}>
            {machine.name}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}
