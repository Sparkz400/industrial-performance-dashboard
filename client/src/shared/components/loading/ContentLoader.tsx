import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

interface ContentLoaderProps {
  message?: string | null;
  size?: number;
  height?: string | number;
  minHeight?: string | number;
}

/**
 * Content loading component for use within cards or content sections
 * @param root0
 * @param root0.message
 * @param root0.size
 * @param root0.height
 * @param root0.minHeight
 */
const ContentLoader: React.FC<ContentLoaderProps> = ({
  message = null,
  size = 30,
  height = '100%',
  minHeight = 100,
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: height,
      minHeight: minHeight,
      width: '100%',
      p: 2,
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

export default ContentLoader;
