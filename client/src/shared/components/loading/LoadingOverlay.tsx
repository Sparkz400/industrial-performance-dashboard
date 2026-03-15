import React from 'react';
import { Backdrop, Box, CircularProgress, Typography, alpha, Theme } from '@mui/material';

interface LoadingOverlayProps {
  open: boolean;
  message?: string | null;
  blur?: boolean;
  fullPage?: boolean;
  opacity?: number;
  zIndex?: number;
}

/**
 * Loading overlay to display on top of existing content
 * @param root0
 * @param root0.open
 * @param root0.message
 * @param root0.blur
 * @param root0.fullPage
 * @param root0.opacity
 * @param root0.zIndex
 */
const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  open = false,
  message = null,
  blur = true,
  fullPage = false,
  opacity = 0.7,
  zIndex = 10,
}) => {
  // For full page, use a higher z-index to appear above fixed elements
  const effectiveZIndex = fullPage ? (theme: Theme) => theme.zIndex.drawer + 1 : zIndex;

  return (
    <Backdrop
      open={open}
      sx={{
        position: fullPage ? 'fixed' : 'absolute',
        zIndex: effectiveZIndex,
        backgroundColor: (theme: Theme) => alpha(theme.palette.background.paper, opacity),
        backdropFilter: blur ? 'blur(4px)' : 'none',
        color: 'text.primary',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
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

export default LoadingOverlay;
