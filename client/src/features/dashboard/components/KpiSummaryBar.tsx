import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { useStatusStore } from '@/stores/useStatusStore';
import { statusColor, systemObservation } from '@/utils/serviceStatus';
import { useT } from '@/i18n';

/**
 *
 */
export default function KpiSummaryBar() {
  const t = useT();
  const status = useStatusStore((s) => s.status);
  const observed = useStatusStore((s) => s.lastChecked);
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        px: { xs: 2, md: 3 },
        py: 1.5,
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {[
        [t('System'), systemObservation(status)],
        [t('Database'), status.database],
        [t('OPC UA gateway', 'OPC-UA-Gateway'), status.opcua],
      ].map(([label, value]) => {
        if (typeof value === 'string') return null;
        return (
          <Chip
            key={String(label)}
            size="small"
            variant="outlined"
            label={`${label}: ${t(value.statusText || 'Unknown')}`}
            color={statusColor(value.status)}
          />
        );
      })}
      <Typography variant="caption" color="text.secondary">
        {t('Last updated:')} {observed?.toLocaleTimeString() ?? t('Never')}
      </Typography>
    </Box>
  );
}
