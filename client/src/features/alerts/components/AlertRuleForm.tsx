import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Chip,
  OutlinedInput,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';

export interface AlertRuleFormValues {
  name: string;
  description: string;
  machineId: number | '';
  nodeKey: string;
  condition: string;
  threshold: number | '';
  thresholdHigh: number | '';
  rateWindowSeconds: number | '';
  severity: string;
  channels: number[];
  cooldownSeconds: number | '';
}

interface Machine {
  id: number;
  name: string;
}

interface Channel {
  id: number;
  name: string;
}

interface AlertRuleFormProps {
  initialValues?: Partial<AlertRuleFormValues>;
  onSubmit: (values: AlertRuleFormValues) => void;
  onCancel: () => void;
  machines?: Machine[];
  channels?: Channel[];
}

const CONDITIONS = [
  { value: 'gt', label: 'Greater Than' },
  { value: 'lt', label: 'Less Than' },
  { value: 'eq', label: 'Equal To' },
  { value: 'neq', label: 'Not Equal To' },
  { value: 'range', label: 'Range' },
  { value: 'rate_of_change', label: 'Rate of Change' },
  { value: 'state_change', label: 'State Change' },
];

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

const defaultValues: AlertRuleFormValues = {
  name: '',
  description: '',
  machineId: '',
  nodeKey: '',
  condition: 'gt',
  threshold: '',
  thresholdHigh: '',
  rateWindowSeconds: '',
  severity: 'medium',
  channels: [],
  cooldownSeconds: 60,
};

const AlertRuleForm: React.FC<AlertRuleFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  machines = [],
  channels = [],
}) => {
  const [values, setValues] = useState<AlertRuleFormValues>({
    ...defaultValues,
    ...initialValues,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues({ ...defaultValues, ...initialValues });
  }, [initialValues]);

  const handleChange = (field: keyof AlertRuleFormValues, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (Object.hasOwn(errors, field) && errors[field as keyof typeof errors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof typeof next];
        return next;
      });
    }
  };

  const handleChannelsChange = (event: SelectChangeEvent<number[]>) => {
    const value = event.target.value;
    handleChange('channels', typeof value === 'string' ? [] : value);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!values.name.trim()) newErrors.name = 'Name is required';
    if (!values.nodeKey.trim()) newErrors.nodeKey = 'Node key is required';
    if (!values.condition) newErrors.condition = 'Condition is required';
    if (values.condition !== 'state_change' && values.threshold === '') {
      newErrors.threshold = 'Threshold is required';
    }
    if (values.condition === 'range' && values.thresholdHigh === '') {
      newErrors.thresholdHigh = 'High threshold is required for range condition';
    }
    if (values.condition === 'rate_of_change' && values.rateWindowSeconds === '') {
      newErrors.rateWindowSeconds = 'Rate window is required for rate of change condition';
    }
    if (!values.severity) newErrors.severity = 'Severity is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(values);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}
    >
      <TextField
        label="Name"
        value={values.name}
        onChange={(e) => handleChange('name', e.target.value)}
        error={!!errors.name}
        helperText={errors.name}
        fullWidth
        required
      />
      <TextField
        label="Description"
        value={values.description}
        onChange={(e) => handleChange('description', e.target.value)}
        fullWidth
        multiline
        rows={2}
      />
      <FormControl fullWidth>
        <InputLabel>Machine</InputLabel>
        <Select
          value={values.machineId}
          label="Machine"
          onChange={(e) => handleChange('machineId', e.target.value)}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {machines.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        label="Node Key"
        value={values.nodeKey}
        onChange={(e) => handleChange('nodeKey', e.target.value)}
        error={!!errors.nodeKey}
        helperText={errors.nodeKey}
        fullWidth
        required
      />
      <FormControl fullWidth error={!!errors.condition}>
        <InputLabel>Condition</InputLabel>
        <Select
          value={values.condition}
          label="Condition"
          onChange={(e) => handleChange('condition', e.target.value)}
        >
          {CONDITIONS.map((c) => (
            <MenuItem key={c.value} value={c.value}>
              {c.label}
            </MenuItem>
          ))}
        </Select>
        {errors.condition && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
            {errors.condition}
          </Typography>
        )}
      </FormControl>
      {values.condition !== 'state_change' && (
        <TextField
          label="Threshold"
          type="number"
          value={values.threshold}
          onChange={(e) =>
            handleChange('threshold', e.target.value === '' ? '' : Number(e.target.value))
          }
          error={!!errors.threshold}
          helperText={errors.threshold}
          fullWidth
          required
        />
      )}
      {values.condition === 'range' && (
        <TextField
          label="Threshold High"
          type="number"
          value={values.thresholdHigh}
          onChange={(e) =>
            handleChange('thresholdHigh', e.target.value === '' ? '' : Number(e.target.value))
          }
          error={!!errors.thresholdHigh}
          helperText={errors.thresholdHigh}
          fullWidth
          required
        />
      )}
      {values.condition === 'rate_of_change' && (
        <TextField
          label="Rate Window (seconds)"
          type="number"
          value={values.rateWindowSeconds}
          onChange={(e) =>
            handleChange('rateWindowSeconds', e.target.value === '' ? '' : Number(e.target.value))
          }
          error={!!errors.rateWindowSeconds}
          helperText={errors.rateWindowSeconds}
          fullWidth
          required
        />
      )}
      <FormControl fullWidth error={!!errors.severity}>
        <InputLabel>Severity</InputLabel>
        <Select
          value={values.severity}
          label="Severity"
          onChange={(e) => handleChange('severity', e.target.value)}
        >
          {SEVERITIES.map((s) => (
            <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl fullWidth>
        <InputLabel>Notification Channels</InputLabel>
        <Select
          multiple
          value={values.channels}
          onChange={handleChannelsChange}
          input={<OutlinedInput label="Notification Channels" />}
          renderValue={(selected) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map((id) => {
                const ch = channels.find((c) => c.id === id);
                return <Chip key={id} label={ch?.name || id} size="small" />;
              })}
            </Box>
          )}
        >
          {channels.map((ch) => (
            <MenuItem key={ch.id} value={ch.id}>
              {ch.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        label="Cooldown (seconds)"
        type="number"
        value={values.cooldownSeconds}
        onChange={(e) =>
          handleChange('cooldownSeconds', e.target.value === '' ? '' : Number(e.target.value))
        }
        fullWidth
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="contained">
          Save
        </Button>
      </Box>
    </Box>
  );
};

export default AlertRuleForm;
