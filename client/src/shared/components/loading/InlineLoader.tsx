import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

type LoaderColor = 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';

interface InlineLoaderProps {
  size?: number;
  text?: string | null;
  color?: LoaderColor;
  inline?: boolean;
}

/**
 * Small inline loading indicator for minor operations
 * @param root0
 * @param root0.size
 * @param root0.text
 * @param root0.color
 * @param root0.inline
 */
const InlineLoader: React.FC<InlineLoaderProps> = ({
  size = 16,
  text = null,
  color = 'primary',
  inline = true,
}) => {
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

export default InlineLoader;
