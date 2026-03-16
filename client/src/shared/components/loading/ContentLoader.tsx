import React from 'react';
import { Box, Skeleton, Typography } from '@mui/material';

interface ContentLoaderProps {
  message?: string | null;
  height?: string | number;
  minHeight?: string | number;
  lines?: number;
}

const ContentLoader: React.FC<ContentLoaderProps> = ({
  message = null,
  height = '100%',
  minHeight = 100,
  lines = 3,
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      height: height,
      minHeight: minHeight,
      width: '100%',
      p: 2,
      gap: 1,
    }}
  >
    <Skeleton variant="text" width="60%" height={24} />
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton
        key={i}
        variant="rectangular"
        height={20}
        sx={{ borderRadius: 0.5, width: `${85 - i * 10}%` }}
      />
    ))}
    {message && (
      <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 1 }}>
        {message}
      </Typography>
    )}
  </Box>
);

export default ContentLoader;
