import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';

/**
 * StatusIndicator component to visualize a status with appropriate color and icon
 */
const StatusIndicator = memo(({ status }) => {
    // Convert status to lowercase for consistent comparison
    const statusStr = (status || '').toLowerCase();

    // Determine icon, color, and label based on status
    let icon, color, label;

    switch (statusStr) {
        case 'online':
        case 'connected':
        case 'healthy':
        case 'ok':
            icon = <CheckCircleIcon />;
            color = 'success';
            label = 'Online';
            break;
        case 'warning':
        case 'degraded':
            icon = <WarningIcon />;
            color = 'warning';
            label = 'Degraded';
            break;
        case 'error':
        case 'offline':
        case 'disconnected':
            icon = <ErrorIcon />;
            color = 'error';
            label = 'Offline';
            break;
        default:
            icon = <WarningIcon />;
            color = 'default';
            label = 'Unknown';
    }

    return (
        <Chip
            icon={icon}
            label={label}
            color={color}
            variant="outlined"
            size="small"
            sx={{ fontWeight: 'bold' }}
        />
    );
}, (prevProps, nextProps) => {
    // Custom comparison function - only re-render if the status changed
    return prevProps.status === nextProps.status;
});

StatusIndicator.propTypes = {
    /** Status string */
    status: PropTypes.string
};

StatusIndicator.displayName = 'StatusIndicator';

export default StatusIndicator;