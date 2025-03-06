// client/src/components/notifications/CertificateNotification.jsx
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
    Paper
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import GppBadIcon from '@mui/icons-material/GppBad';
import io from 'socket.io-client';
import { WEBSOCKET_ADDR } from '../../../config/config.js';

/**
 * Component that listens for certificate events and shows notifications
 * for untrusted certificates with the option to accept them
 */
const CertificateNotification = () => {
    const [notification, setNotification] = useState(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Socket connection state
    const [socket, setSocket] = useState(null);

    // Create socket connection on mount
    useEffect(() => {
        // Create socket connection with admin role
        const socketConnection = io(WEBSOCKET_ADDR, {
            query: { role: 'admin' }
        });
        setSocket(socketConnection);
        // Listen for certificate events
        socketConnection.on('untrustedCertificate', (data) => {
            console.log('Received untrusted certificate notification:', data);

            // Set notification data and open dialog
            setNotification(data);
            setOpen(true);
        });

        // Listen for acceptance events
        socketConnection.on('certificateAccepted', (data) => {
            if (data.success) {
                setSuccess(`Certificate ${data.filename} accepted successfully`);

                // Close dialog after a short delay
                setTimeout(() => {
                    setOpen(false);
                    setNotification(null);
                }, 2000);
            } else {
                setError(`Failed to accept certificate ${data.filename}`);
            }
        });

        // Listen for certificate errors
        socketConnection.on('certificateError', (data) => {
            setError(data.error);
        });

        // Clean up on unmount
        return () => {
            socketConnection.off('untrustedCertificate');
            socketConnection.off('certificateAccepted');
            socketConnection.off('certificateError');
            socketConnection.disconnect();
        };
    }, []);

    // Handle accepting the certificate
    const handleAccept = useCallback(() => {
        if (!socket || !notification || !notification.filename) {
            setError('Cannot accept certificate: missing information');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        // Emit acceptance event
        socket.emit('acceptCertificate', notification.filename);
    }, [socket, notification]);

    // Handle dialog close
    const handleClose = useCallback(() => {
        setOpen(false);

        // Clear notification after a short delay to allow for exit animations
        setTimeout(() => {
            setNotification(null);
            setError(null);
            setSuccess(null);
        }, 300);
    }, []);

    // Clear success message after 5 seconds
    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => {
                setSuccess(null);
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [success]);

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                bgcolor: 'warning.main',
                color: 'warning.contrastText'
            }}>
                <GppBadIcon sx={{ mr: 1 }} />
                Untrusted Certificate Detected
            </DialogTitle>
            <DialogContent>
                {error && (
                    <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {success && (
                    <Alert severity="success" sx={{ mt: 2, mb: 2 }}>
                        {success}
                    </Alert>
                )}

                {notification && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="body1" paragraph>
                            An untrusted certificate has been received from an OPC UA server.
                            Do you want to accept and trust this certificate?
                        </Typography>

                        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                            <Typography variant="subtitle2">
                                Certificate Details:
                            </Typography>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="body2">
                                <strong>Server:</strong> {notification.serverUri || 'Unknown'}
                            </Typography>
                            <Typography variant="body2">
                                <strong>Received:</strong> {new Date(notification.timestamp).toLocaleString()}
                            </Typography>
                            <Typography variant="body2">
                                <strong>Certificate Hash:</strong> {notification.certificateHash?.substring(0, 32)}...
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