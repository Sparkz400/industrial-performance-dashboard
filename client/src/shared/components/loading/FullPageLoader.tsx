import React from 'react';
import { Box, CircularProgress, Typography, Theme } from '@mui/material';

interface FullPageLoaderProps {
  message?: string;
  size?: number;
}

/**
 * Full page loading component for initial page loads or major data fetching operations
 * @param root0
 * @param root0.message
 * @param root0.size
 */
const FullPageLoader: React.FC<FullPageLoaderProps> = ({ message = 'Loading...', size = 40 }) => (
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
      zIndex: (theme: Theme) => theme.zIndex.drawer + 1,
    }}
  >
    <CircularProgress size={size} sx={{ mb: 3 }} />
    <Typography variant="h6" color="textSecondary">
      {message}
    </Typography>
  </Box>
);

export default FullPageLoader;
