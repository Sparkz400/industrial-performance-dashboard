import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Alert,
} from '@mui/material';
import type { Machine, MachineFormData } from '@/types';

interface MachineFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: MachineFormData) => Promise<void>;
  machine?: Machine | null;
}

const defaultFormData: MachineFormData = {
  name: '',
  ip: '',
  port: 4840,
  resourcePath: '',
  securityMode: 'None',
  securityPolicy: 'None',
  isActive: true,
};

const MachineForm: React.FC<MachineFormProps> = ({ open, onClose, onSubmit, machine }) => {
  const [formData, setFormData] = useState<MachineFormData>(defaultFormData);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (machine) {
      setFormData({
        name: machine.name,
        ip: machine.ip,
        port: machine.port,
        resourcePath: machine.resourcePath,
        securityMode: machine.securityMode,
        securityPolicy: machine.securityPolicy,
        isActive: machine.isActive,
      });
    } else {
      setFormData(defaultFormData);
    }
    setError(null);
  }, [machine, open]);

  const handleChange = (
    field: keyof MachineFormData,
    value: MachineFormData[keyof MachineFormData],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.ip.trim()) {
      setError('Name and IP are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(formData);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{machine ? 'Edit Machine' : 'Add Machine'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Machine Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            fullWidth
            required
            placeholder="e.g. Production Line 1"
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="IP Address"
              value={formData.ip}
              onChange={(e) => handleChange('ip', e.target.value)}
              fullWidth
              required
              placeholder="e.g. 192.168.1.100"
            />
            <TextField
              label="Port"
              type="number"
              value={formData.port}
              onChange={(e) => handleChange('port', parseInt(e.target.value, 10))}
              sx={{ width: 120 }}
              required
            />
          </Box>

          <TextField
            label="Resource Path"
            value={formData.resourcePath}
            onChange={(e) => handleChange('resourcePath', e.target.value)}
            fullWidth
            placeholder="e.g. /OPCUA/SimulationServer"
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Security Mode</InputLabel>
              <Select
                value={formData.securityMode}
                label="Security Mode"
                onChange={(e) => handleChange('securityMode', e.target.value)}
              >
                <MenuItem value="None">None</MenuItem>
                <MenuItem value="Sign">Sign</MenuItem>
                <MenuItem value="SignAndEncrypt">Sign and Encrypt</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Security Policy</InputLabel>
              <Select
                value={formData.securityPolicy}
                label="Security Policy"
                onChange={(e) => handleChange('securityPolicy', e.target.value)}
              >
                <MenuItem value="None">None</MenuItem>
                <MenuItem value="Basic256Sha256">Basic256Sha256</MenuItem>
                <MenuItem value="Aes128_Sha256_RsaOaep">Aes128_Sha256_RsaOaep</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={formData.isActive}
                onChange={(e) => handleChange('isActive', e.target.checked)}
              />
            }
            label="Active"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          {submitting ? 'Saving...' : machine ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MachineForm;
