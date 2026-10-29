import React from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { useT } from '@/i18n';

interface MachinePickerProps {
  machines: { id: number; name: string }[] | undefined;
  value: string;
  onChange: (id: string) => void;
}

/**
 * Searchable machine selector; typing filters by name.
 * @param root0
 * @param root0.machines
 * @param root0.value
 * @param root0.onChange
 */
export default function MachinePicker({ machines = [], value, onChange }: MachinePickerProps) {
  const t = useT();
  return (
    <Autocomplete
      options={machines}
      value={machines.find((m) => String(m.id) === value) ?? null}
      onChange={(_, machine) => onChange(machine ? String(machine.id) : '')}
      getOptionLabel={(machine) => machine.name}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      noOptionsText={t('No matching machine', 'Keine passende Maschine')}
      renderInput={(params) => (
        <TextField {...params} label={t('Machine')} placeholder={t('Search', 'Suchen')} />
      )}
    />
  );
}
