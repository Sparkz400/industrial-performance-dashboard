import React from 'react';
import PropTypes from 'prop-types';
import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * Small inline loading indicator for minor operations
 */
const InlineLoader = ({ size = 16, text = null, color = 'primary', inline = true }) => {
    if (inline) {
        return (
            <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                <CircularProgress size={size} color={color} thickness={4} />
                {text && (
                    <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                        {text}
                    </Typography>
                )}
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <CircularProgress size={size} color={color} thickness={4} />
            {text && (
                <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                    {text}
                </Typography>
            )}
        </Box>
    );
};

InlineLoader.propTypes = {
    size: PropTypes.number,
    text: PropTypes.string,
    color: PropTypes.oneOf(['inherit', 'primary', 'secondary', 'success', 'error', 'info', 'warning']),
    inline: PropTypes.bool
};

export default InlineLoader;