import React, { memo } from 'react';
import { Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface StatusObject {
  status?: string;
  statusText?: string;
}

interface StatusIndicatorProps {
  /** Status string or object with status or statusText property */
  status?: string | StatusObject;
  /** Chip size */
  size?: 'small' | 'medium';
  /** Chip variant */
  variant?: 'filled' | 'outlined';
}

/**
 * StatusIndicator component to visualize a status with appropriate color and icon
 */
const StatusIndicator = memo<StatusIndicatorProps>(
  ({ status, size = 'small', variant = 'outlined' }) => {
    // Convert status to lowercase for consistent comparison
    const statusStr = (
      typeof status === 'string' ? status : status?.status || status?.statusText || ''
    ).toLowerCase();

    // Determine icon, color, and label based on status
    let icon: React.ReactElement;
    let color: 'success' | 'warning' | 'error' | 'default';
    let label: string;

    switch (statusStr) {
      case 'online':
      case 'connected':
      case 'healthy':
      case 'ok':
        icon = <CheckCircleIcon fontSize={size === 'small' ? 'small' : 'medium'} />;
        color = 'success';
        label = 'Online';
        break;
      case 'warning':
      case 'degraded':
        icon = <WarningIcon fontSize={size === 'small' ? 'small' : 'medium'} />;
        color = 'warning';
        label = 'Degraded';
        break;
      case 'error':
      case 'offline':
      case 'disconnected':
        icon = <ErrorIcon fontSize={size === 'small' ? 'small' : 'medium'} />;
        color = 'error';
        label = 'Offline';
        break;
      default:
        icon = <HelpOutlineIcon fontSize={size === 'small' ? 'small' : 'medium'} />;
        color = 'default';
        label = 'Unknown';
    }

    return (
      <Chip
        icon={icon}
        label={label}
        color={color}
        variant={variant}
        size={size}
        sx={{ fontWeight: 'bold' }}
      />
    );
  },
  (prevProps: StatusIndicatorProps, nextProps: StatusIndicatorProps) => {
    // Custom comparison function - only re-render if the status changed
    // Handle both string and object status types
    const prevStatus =
      typeof prevProps.status === 'object'
        ? (prevProps.status as StatusObject)?.status ||
          (prevProps.status as StatusObject)?.statusText ||
          ''
        : prevProps.status;

    const nextStatus =
      typeof nextProps.status === 'object'
        ? (nextProps.status as StatusObject)?.status ||
          (nextProps.status as StatusObject)?.statusText ||
          ''
        : nextProps.status;

    return (
      prevStatus === nextStatus &&
      prevProps.size === nextProps.size &&
      prevProps.variant === nextProps.variant
    );
  },
);

StatusIndicator.displayName = 'StatusIndicator';

export default StatusIndicator;
