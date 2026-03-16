import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
} from '@mui/material';

interface ReasonForChangeDialogProps {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const ReasonForChangeDialog: React.FC<ReasonForChangeDialogProps> = ({
  open,
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('A reason for the change is required.');
      return;
    }
    onConfirm(reason.trim());
    setReason('');
    setError('');
  };

  const handleCancel = () => {
    setReason('');
    setError('');
    onCancel();
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Reason for Change</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A reason is required for audit compliance. Please describe why this change is being made.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          label="Reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError('');
          }}
          error={!!error}
          helperText={error}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!reason.trim()}>
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReasonForChangeDialog;
