import React from 'react';
import { Box, Skeleton } from '@mui/material';

type WidgetSkeletonVariant = 'chart' | 'table' | 'status' | 'default';

interface WidgetSkeletonProps {
  variant?: WidgetSkeletonVariant;
}

const ChartSkeleton: React.FC = () => (
  <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Skeleton variant="text" width="40%" height={28} />
    <Skeleton variant="text" width="25%" height={18} sx={{ mb: 2 }} />
    <Skeleton variant="rectangular" sx={{ flexGrow: 1, borderRadius: 1 }} />
  </Box>
);

const TableSkeleton: React.FC = () => (
  <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Skeleton variant="text" width="35%" height={28} sx={{ mb: 2 }} />
    <Skeleton variant="rectangular" height={36} sx={{ mb: 0.5, borderRadius: 0.5 }} />
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton
        key={i}
        variant="rectangular"
        height={32}
        sx={{ mb: 0.5, borderRadius: 0.5, opacity: 1 - i * 0.15 }}
      />
    ))}
  </Box>
);

const StatusSkeleton: React.FC = () => (
  <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <Skeleton variant="text" width="50%" height={28} />
    {Array.from({ length: 4 }, (_, i) => (
      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Skeleton variant="circular" width={32} height={32} />
        <Box sx={{ flexGrow: 1 }}>
          <Skeleton variant="text" width={`${60 + Math.random() * 30}%`} height={20} />
          <Skeleton variant="text" width="40%" height={16} />
        </Box>
      </Box>
    ))}
  </Box>
);

const DefaultSkeleton: React.FC = () => (
  <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
    <Skeleton variant="text" width="45%" height={28} />
    <Skeleton variant="text" width="65%" height={18} />
    <Skeleton variant="rectangular" sx={{ flexGrow: 1, borderRadius: 1, mt: 1 }} />
  </Box>
);

const WidgetSkeleton: React.FC<WidgetSkeletonProps> = ({ variant = 'default' }) => {
  switch (variant) {
    case 'chart':
      return <ChartSkeleton />;
    case 'table':
      return <TableSkeleton />;
    case 'status':
      return <StatusSkeleton />;
    default:
      return <DefaultSkeleton />;
  }
};

export default React.memo(WidgetSkeleton);
