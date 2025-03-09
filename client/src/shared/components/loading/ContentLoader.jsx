import React from 'react';
import PropTypes from 'prop-types';
import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * Content loading component for use within cards or content sections
 */
const ContentLoader = ({ message = null, size = 30, height = '100%', minHeight = 100 }) => {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: height,
                minHeight: minHeight,
                width: '100%',
                p: 2
            }}
        >
            <CircularProgress size={size} sx={{ mb: message ? 2 : 0 }} />
            {message && (
                <Typography variant="body2" color="textSecondary" align="center">
                    {message}
                </Typography>
            )}
        </Box>
    );
};

ContentLoader.propTypes = {
    message: PropTypes.string,
    size: PropTypes.number,
    height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    minHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export default ContentLoader;