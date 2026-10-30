import React from 'react';
import type { ReactNode } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { statusColor } from '@/utils/serviceStatus';
import { useT } from '@/i18n';

/**
 *
 * @param root0
 * @param root0.status
 * @param root0.label
 * @param root0.description
 * @param root0.icon
 * @param root0.loading
 */
export default function StatusIndicator({
  status,
  label,
  description,
  loading = false,
}: {
  status: string;
  label: string;
  description: string;
  icon?: ReactNode;
  loading?: boolean;
}) {
  const t = useT();
  return (
    <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: '7px', height: '100%' }}>
      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', mb: 1 }}
      >
        <Typography sx={{ fontWeight: 600 }}>{label}</Typography>
        <Chip
          size="small"
          variant="outlined"
          label={t(loading ? 'Checking...' : status || 'Unknown')}
          color={loading ? 'info' : statusColor(status)}
        />
      </Box>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
  );
}
