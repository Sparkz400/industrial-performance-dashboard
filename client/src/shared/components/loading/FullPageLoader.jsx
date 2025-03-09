import React from 'react';
import PropTypes from 'prop-types';
import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * Full page loading component for initial page loads or major data fetching operations
 */
const FullPageLoader = ({ message = 'Loading...', size = 40 }) => {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                width: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                bgcolor: 'background.paper',
                zIndex: (theme) => theme.zIndex.drawer + 1
            }}
        >
            <CircularProgress size={size} sx={{ mb: 3 }} />
            <Typography variant="h6" color="textSecondary">
                {message}
            </Typography>
        </Box>
    );
};

FullPageLoader.propTypes = {
    message: PropTypes.string,
    size: PropTypes.number
};

export default FullPageLoader;