import React from 'react';
import { Typography, Box, Card, CardContent, Chip, CircularProgress } from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';

interface StatusIndicatorProps {
  status: string;
  label: string;
  description: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  description,
  icon,
  loading = false,
}) => {
  // Use MUI theme properly
  const theme = useMuiTheme();

  // Determine color based on status
  const getStatusColor = (): string => {
    if (loading) return theme?.palette?.info?.main || '#2196f3';

    switch (status?.toLowerCase()) {
      case 'connected':
      case 'online':
      case 'ok':
        return theme?.palette?.success?.main || '#4caf50';
      case 'warning':
      case 'degraded':
        return theme?.palette?.warning?.main || '#ff9800';
      case 'error':
      case 'offline':
      case 'disconnected':
        return theme?.palette?.error?.main || '#f44336';
      default:
        // Safely provide a fallback if theme is not available
        return theme?.palette?.text?.disabled || '#757575';
    }
  };

  // Get icon based on status
  const getStatusIcon = (): React.ReactNode => {
    if (loading) return <CircularProgress size={24} color="inherit" />;

    switch (status?.toLowerCase()) {
      case 'connected':
      case 'online':
      case 'ok':
        return <CheckCircleIcon />;
      case 'warning':
      case 'degraded':
        return <WarningIcon />;
      case 'error':
      case 'offline':
      case 'disconnected':
        return <ErrorIcon />;
      default:
        return icon || <InfoIcon />;
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        overflow: 'visible',
        mb: 2,
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: 3,
          transform: 'translateY(-2px)',
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: '-16px',
          left: '16px',
          backgroundColor: getStatusColor(),
          borderRadius: '50%',
          p: 1,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 2,
        }}
      >
        {getStatusIcon()}
      </Box>
      <CardContent sx={{ pt: 4, pl: 2, pb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight="medium" gutterBottom>
              {label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </Box>
          <Chip
            label={loading ? 'Checking...' : status || 'Unknown'}
            color={
              loading
                ? 'info'
                : status?.toLowerCase() === 'connected' ||
                    status?.toLowerCase() === 'online' ||
                    status?.toLowerCase() === 'ok'
                  ? 'success'
                  : status?.toLowerCase() === 'warning' || status?.toLowerCase() === 'degraded'
                    ? 'warning'
                    : status?.toLowerCase() === 'error' ||
                        status?.toLowerCase() === 'offline' ||
                        status?.toLowerCase() === 'disconnected'
                      ? 'error'
                      : 'default'
            }
            size="small"
            variant={loading ? 'outlined' : 'filled'}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

export default StatusIndicator;
