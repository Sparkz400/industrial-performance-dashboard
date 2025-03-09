import React from 'react';
import PropTypes from 'prop-types';
import { Backdrop, Box, CircularProgress, Typography, alpha } from '@mui/material';

/**
 * Loading overlay to display on top of existing content
 */
const LoadingOverlay = ({
                            open = false,
                            message = null,
                            blur = true,
                            fullPage = false,
                            opacity = 0.7,
                            zIndex = 10
                        }) => {
    // For full page, use a higher z-index to appear above fixed elements
    const effectiveZIndex = fullPage
        ? theme => theme.zIndex.drawer + 1
        : zIndex;

    return (
        <Backdrop
            open={open}
            sx={{
                position: fullPage ? 'fixed' : 'absolute',
                zIndex: effectiveZIndex,
                backgroundColor: theme => alpha(theme.palette.background.paper, opacity),
                backdropFilter: blur ? 'blur(4px)' : 'none',
                color: 'text.primary',
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <CircularProgress color="primary" size={40} />
            {message && (
                <Box sx={{ mt: 2, textAlign: 'center', maxWidth: '80%' }}>
                    <Typography variant="body1">{message}</Typography>
                </Box>
            )}
        </Backdrop>
    );
};

LoadingOverlay.propTypes = {
    open: PropTypes.bool.isRequired,
    message: PropTypes.string,
    blur: PropTypes.bool,
    fullPage: PropTypes.bool,
    opacity: PropTypes.number,
    zIndex: PropTypes.number
};

export default LoadingOverlay;