import React, { useEffect } from 'react';
import { Alert, Box, MenuItem, Stack, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMachineStore } from '@/stores/useMachineStore';
import type { WidgetSettingsProps } from '@/types';
import { registrationsQuery } from './registrations';

/**
 * Chooses a registered widget (pinning its version), the machine and the signals it receives.
 * @param root0
 * @param root0.config
 * @param root0.onConfigChange
 */
export default function CustomWidgetSettings({ config, onConfigChange }: WidgetSettingsProps) {
  const registrations = useQuery(registrationsQuery);
  const machines = useMachineStore((s) => s.machines);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);
  useEffect(() => {
    if (machines.length === 0) void fetchMachines();
  }, [machines.length, fetchMachines]);
  const selected = registrations.data?.find((r) => r.id === Number(config.registrationId));
  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2}>
        <TextField
          select
          label="Registered widget"
          value={config.registrationId ?? ''}
          onChange={(e) => {
            const registration = registrations.data?.find((r) => r.id === Number(e.target.value));
            onConfigChange({
              ...config,
              registrationId: registration?.id ?? null,
              version: registration?.manifest.version ?? '',
            });
          }}
        >
          {registrations.data
            ?.filter((r) => r.isActive)
            .map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.manifest.name} v{r.manifest.version}
              </MenuItem>
            ))}
        </TextField>
        {selected && selected.manifest.version !== config.version && (
          <Alert severity="warning">
            Reselect the widget to accept version {selected.manifest.version}.
          </Alert>
        )}
        <TextField
          select
          label="Machine for the widget"
          value={config.machineId ?? ''}
          onChange={(e) =>
            onConfigChange({ ...config, machineId: e.target.value ? Number(e.target.value) : null })
          }
        >
          {machines.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Signals the widget receives (comma separated)"
          value={Array.isArray(config.nodeKeys) ? config.nodeKeys.join(', ') : ''}
          onChange={(e) =>
            onConfigChange({
              ...config,
              nodeKeys: e.target.value
                .split(',')
                .map((key) => key.trim())
                .filter(Boolean)
                .slice(0, 8),
            })
          }
          helperText="Sent only if the widget's manifest asks to read series; your own machine access applies."
        />
      </Stack>
    </Box>
  );
}
