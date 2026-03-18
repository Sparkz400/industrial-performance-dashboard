// client/src/components/notifications/CertificateNotification.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Divider,
  Paper,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import GppBadIcon from '@mui/icons-material/GppBad';
import io, { type Socket } from 'socket.io-client';
import { WEBSOCKET_ADDR } from '@/config/config';
import { useSnackbar } from 'notistack';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  CertificateNotification as CertificateNotificationData,
  CertificateAcceptedResult,
  CertificateError as CertificateErrorData,
} from '@/types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Component that listens for certificate events and shows notifications
 * for untrusted certificates with the option to accept them
 */
const CertificateNotification: React.FC = () => {
  const [notification, setNotification] = useState<CertificateNotificationData | null>(null);
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const { enqueueSnackbar } = useSnackbar();
  const [socket, setSocket] = useState<TypedSocket | null>(null);

  // Create socket connection on mount
  useEffect(() => {
    // Create socket connection with admin role
    const socketConnection: TypedSocket = io(WEBSOCKET_ADDR, {
      transports: ['websocket'],
      withCredentials: true,
    });
    setSocket(socketConnection);
    // Listen for certificate events
    socketConnection.on('untrustedCertificate', (data: CertificateNotificationData) => {
      console.warn('Received untrusted certificate notification:', data);

      // Set notification data and open dialog
      setNotification(data);
      setOpen(true);
    });

    // Listen for acceptance events
    socketConnection.on('certificateAccepted', (data: CertificateAcceptedResult) => {
      if (data.success) {
        enqueueSnackbar(`Certificate ${data.filename} accepted successfully`, {
          variant: 'success',
        });

        // Close dialog after a short delay
        setTimeout(() => {
          setOpen(false);
          setNotification(null);
        }, 2000);
      } else {
        enqueueSnackbar(
          `Failed to accept certificate ${data.filename}: ${data.error || 'Unknown error'}`,
          { variant: 'error' },
        );
      }
    });

    // Listen for certificate errors
    socketConnection.on('certificateError', (data: CertificateErrorData) => {
      enqueueSnackbar(`Certificate error: ${data.error || 'Unknown error'}`, { variant: 'error' });
    });

    // Clean up on unmount
    return () => {
      socketConnection.off('untrustedCertificate');
      socketConnection.off('certificateAccepted');
      socketConnection.off('certificateError');
      socketConnection.disconnect();
    };
  }, [enqueueSnackbar]);

  // Handle accepting the certificate
  const handleAccept = useCallback((): void => {
    if (!socket || !notification || !notification.filename) {
      enqueueSnackbar('Cannot accept certificate: missing information', { variant: 'error' });
      return;
    }

    setLoading(true);

    // Emit acceptance event
    socket.emit('acceptCertificate', notification.filename);
  }, [socket, notification, enqueueSnackbar]);

  // Handle dialog close
  const handleClose = useCallback((): void => {
    setOpen(false);

    // Clear notification after a short delay to allow for exit animations
    setTimeout(() => {
      setNotification(null);
    }, 300);
  }, []);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'warning.main',
          color: 'warning.contrastText',
        }}
      >
        <GppBadIcon sx={{ mr: 1 }} />
        Untrusted Certificate Detected
      </DialogTitle>
      <DialogContent>
        {notification && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" paragraph>
              An untrusted certificate has been received from an OPC UA server. Do you want to
              accept and trust this certificate?
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2">Certificate Details:</Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2">
                <strong>Server:</strong> {notification.serverUri || 'Unknown'}
              </Typography>
              <Typography variant="body2">
                <strong>Received:</strong> {new Date(notification.timestamp).toLocaleString()}
              </Typography>
              <Typography variant="body2">
                <strong>Certificate Hash:</strong> {notification.certificateHash?.substring(0, 32)}
                ...
              </Typography>
            </Paper>

            <Alert severity="warning">
              <Typography variant="body2">
                <strong>Security Warning:</strong> Only accept certificates from servers you trust.
                Accepting an untrusted certificate could expose your system to security risks.
              </Typography>
            </Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Reject
        </Button>
        <Button
          onClick={handleAccept}
          variant="contained"
          color="primary"
          disabled={loading || !notification}
          startIcon={loading ? <CircularProgress size={16} /> : <SecurityIcon />}
        >
          {loading ? 'Accepting...' : 'Trust Certificate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CertificateNotification;
