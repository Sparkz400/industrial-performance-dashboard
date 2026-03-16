import React from 'react';
import { Box, Skeleton, Grid } from '@mui/material';

type PageSkeletonVariant = 'cards' | 'table' | 'default';

interface PageSkeletonProps {
  variant?: PageSkeletonVariant;
  count?: number;
}

const CardsSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <Grid container spacing={2}>
    {Array.from({ length: count }, (_, i) => (
      <Grid item xs={12} sm={6} md={4} key={i}>
        <Skeleton
          variant="rectangular"
          height={180}
          sx={{ borderRadius: 2, opacity: 1 - i * 0.1 }}
        />
      </Grid>
    ))}
  </Grid>
);

const TablePageSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <Box>
    <Skeleton variant="rectangular" height={42} sx={{ mb: 0.5, borderRadius: 1 }} />
    {Array.from({ length: count }, (_, i) => (
      <Skeleton
        key={i}
        variant="rectangular"
        height={52}
        sx={{ mb: 0.5, borderRadius: 0.5, opacity: 1 - i * 0.08 }}
      />
    ))}
  </Box>
);

const DefaultPageSkeleton: React.FC = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <Skeleton variant="text" width="30%" height={40} />
    <Skeleton variant="text" width="50%" height={24} />
    <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
  </Box>
);

const PageSkeleton: React.FC<PageSkeletonProps> = ({ variant = 'default', count = 6 }) => {
  switch (variant) {
    case 'cards':
      return <CardsSkeleton count={count} />;
    case 'table':
      return <TablePageSkeleton count={count} />;
    default:
      return <DefaultPageSkeleton />;
  }
};

export default React.memo(PageSkeleton);
