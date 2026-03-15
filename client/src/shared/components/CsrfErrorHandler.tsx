import React, { useState, useEffect } from 'react';
import { useCsrf } from '../../utils/csrfContext';
import { Snackbar, Alert, Button } from '@mui/material';

/**
 * Component to handle CSRF token errors and provide refresh functionality
 * This can be placed in App.jsx to handle application-wide CSRF errors
 */
const CsrfErrorHandler: React.FC = () => {
  const [open, setOpen] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const { refreshToken } = useCsrf();

  // Listen for CSRF error events
  useEffect(() => {
    const handleCsrfError = (): void => {
      setOpen(true);
    };

    // Create a custom event for CSRF errors
    window.addEventListener('csrf:error', handleCsrfError);

    return () => {
      window.removeEventListener('csrf:error', handleCsrfError);
    };
  }, []);

  // Handle manual token refresh
  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await refreshToken();
      setOpen(false);
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Close the snackbar
  const handleClose = (): void => {
    setOpen(false);
  };

  return (
    <Snackbar open={open} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Token'}
          </Button>
        }
        onClose={handleClose}
      >
        CSRF token error detected. Please refresh the token.
      </Alert>
    </Snackbar>
  );
};

export default CsrfErrorHandler;
