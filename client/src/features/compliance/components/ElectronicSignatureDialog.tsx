import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

interface ElectronicSignatureDialogProps {
  open: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

const ElectronicSignatureDialog: React.FC<ElectronicSignatureDialogProps> = ({
  open,
  onConfirm,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!password) {
      setError('Password is required to verify your identity.');
      return;
    }
    onConfirm(password);
    setPassword('');
    setError('');
  };

  const handleCancel = () => {
    setPassword('');
    setError('');
    onCancel();
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LockIcon color="primary" />
        Electronic Signature
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Re-enter your password to electronically sign this action.
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This signature will be recorded for regulatory compliance purposes.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          type="password"
          label="Password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError('');
          }}
          error={!!error}
          helperText={error}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!password}>
          Verify
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ElectronicSignatureDialog;
