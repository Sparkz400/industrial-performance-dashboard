import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

/**
 * StatusIndicator component to visualize a status with appropriate color and icon
 */
const StatusIndicator = memo(({ status, size = 'small', variant = 'outlined' }) => {
    // Convert status to lowercase for consistent comparison
    const statusStr = (typeof status === 'string' ? status :
        (status?.status || status?.statusText || '')).toLowerCase();

    // Determine icon, color, and label based on status
    let icon, color, label;

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
}, (prevProps, nextProps) => {
    // Custom comparison function - only re-render if the status changed
    // Handle both string and object status types
    const prevStatus = typeof prevProps.status === 'object'
        ? (prevProps.status?.status || prevProps.status?.statusText || '')
        : prevProps.status;

    const nextStatus = typeof nextProps.status === 'object'
        ? (nextProps.status?.status || nextProps.status?.statusText || '')
        : nextProps.status;

    return prevStatus === nextStatus &&
        prevProps.size === nextProps.size &&
        prevProps.variant === nextProps.variant;
});

StatusIndicator.propTypes = {
    /** Status string or object with status or statusText property */
    status: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.shape({
            status: PropTypes.string,
            statusText: PropTypes.string
        })
    ]),
    /** Chip size */
    size: PropTypes.oneOf(['small', 'medium']),
    /** Chip variant */
    variant: PropTypes.oneOf(['filled', 'outlined'])
};

StatusIndicator.displayName = 'StatusIndicator';

export default StatusIndicator;