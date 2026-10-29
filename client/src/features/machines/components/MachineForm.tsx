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

// The collector's defaults; servers may revise them, which diagnostics show.
const DEFAULT_LIMITS = {
  publishingIntervalMs: 500,
  queueSize: 10,
  maxNotificationsPerPublish: 100,
};

const defaultFormData: MachineFormData = {
  name: '',
  ip: '',
  port: 4840,
  resourcePath: '',
  securityMode: 'None',
  securityPolicy: 'None',
  isActive: true,
  authentication: { mode: 'anonymous' },
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
        authentication: machine.authentication ?? { mode: 'anonymous' },
        subscription: machine.subscription ?? null,
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
              <InputLabel id="machine-security-mode">Security Mode</InputLabel>
              <Select
                labelId="machine-security-mode"
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
              <InputLabel id="machine-security-policy">Security Policy</InputLabel>
              <Select
                labelId="machine-security-policy"
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

          <FormControl fullWidth>
            <InputLabel id="machine-authentication">Machine authentication</InputLabel>
            <Select
              labelId="machine-authentication"
              label="Machine authentication"
              value={formData.authentication?.mode ?? 'anonymous'}
              onChange={(event) =>
                setFormData((previous) => ({
                  ...previous,
                  authentication: {
                    mode: event.target.value as 'anonymous' | 'username' | 'certificate',
                  },
                  ...(event.target.value !== 'anonymous'
                    ? {
                        securityMode: 'SignAndEncrypt',
                        securityPolicy:
                          previous.securityPolicy === 'None'
                            ? 'Basic256Sha256'
                            : previous.securityPolicy,
                      }
                    : {}),
                }))
              }
            >
              <MenuItem value="anonymous">Anonymous</MenuItem>
              <MenuItem value="username">Username and password</MenuItem>
              <MenuItem value="certificate">User certificate</MenuItem>
            </Select>
          </FormControl>
          {formData.authentication?.mode === 'username' && (
            <>
              <TextField
                label="Machine username"
                autoComplete="off"
                value={formData.authentication.username ?? ''}
                onChange={(event) =>
                  handleChange('authentication', {
                    ...formData.authentication!,
                    username: event.target.value,
                  })
                }
              />
              <TextField
                label="Machine password"
                type="password"
                autoComplete="new-password"
                value={formData.authentication.password ?? ''}
                helperText={
                  machine?.authentication?.mode === 'username'
                    ? 'Leave blank to keep the saved password for the same username.'
                    : 'Use a dedicated account with read access only.'
                }
                onChange={(event) =>
                  handleChange('authentication', {
                    ...formData.authentication!,
                    password: event.target.value,
                  })
                }
              />
            </>
          )}
          {formData.authentication?.mode === 'certificate' && (
            <>
              <Alert severity="info">
                User certificates require support from the server. S7-1500 availability depends on
                CPU and firmware. This is separate from the application certificate under Settings.
              </Alert>
              <TextField
                label="User certificate (PEM)"
                multiline
                minRows={3}
                value={formData.authentication.certificatePem ?? ''}
                onChange={(event) =>
                  handleChange('authentication', {
                    ...formData.authentication!,
                    certificatePem: event.target.value,
                  })
                }
              />
              <Button component="label" variant="outlined">
                {formData.authentication.privateKeyPem
                  ? 'Replacement private key loaded'
                  : 'Load user private key (PEM)'}
                <input
                  type="file"
                  accept=".pem,.key"
                  aria-label="User private key (PEM)"
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 32768) {
                      setError('Private key file must be at most 32 KiB.');
                      return;
                    }
                    try {
                      handleChange('authentication', {
                        ...formData.authentication!,
                        privateKeyPem: await file.text(),
                      });
                    } catch {
                      setError('The private key file could not be read.');
                    }
                  }}
                />
              </Button>
              <Alert severity="info">
                Replace certificate and key together. Leave both unchanged to retain the saved
                identity. Private key contents are never displayed.
              </Alert>
              {formData.authentication.certificateExpiresAt && (
                <Alert
                  severity={
                    Date.parse(formData.authentication.certificateExpiresAt) - Date.now() <
                    30 * 86400000
                      ? 'warning'
                      : 'info'
                  }
                >
                  User certificate expires{' '}
                  {new Date(formData.authentication.certificateExpiresAt).toLocaleDateString()}.
                </Alert>
              )}
            </>
          )}
          {formData.securityMode === 'None' && (
            <Alert severity="warning">
              Unsecured connection: use only with an isolated simulator. Use Sign and Encrypt for a
              machine pilot.
            </Alert>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={!!formData.subscription}
                onChange={(e) =>
                  setFormData((previous) => ({
                    ...previous,
                    subscription: e.target.checked ? { ...DEFAULT_LIMITS } : null,
                  }))
                }
              />
            }
            label="Custom subscription limits for this endpoint"
          />
          {formData.subscription && (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr 1fr' } }}>
              {(
                [
                  ['publishingIntervalMs', 'Publishing interval (ms)', 50, 60000],
                  ['queueSize', 'Queue size per signal', 1, 1000],
                  [
                    'maxNotificationsPerPublish',
                    'Max notifications per publish (0 = server limit)',
                    0,
                    10000,
                  ],
                ] as const
              ).map(([key, label, min, max]) => (
                <TextField
                  key={key}
                  type="number"
                  label={label}
                  // eslint-disable-next-line security/detect-object-injection -- key comes from the fixed list above
                  value={formData.subscription![key]}
                  slotProps={{ htmlInput: { min, max } }}
                  onChange={(e) =>
                    setFormData((previous) => ({
                      ...previous,
                      subscription: { ...previous.subscription!, [key]: Number(e.target.value) },
                    }))
                  }
                />
              ))}
            </Box>
          )}

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
