import React, { useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useOeeTrendData } from './useOeeTrendData';
import OeeTrendWidgetView from './OeeTrendWidgetView';
import type { WidgetConfig } from '@/types';
import type { Granularity } from './useOeeTrendData';

interface OeeTrendWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

/**
 * Container component for OEE Trend Widget
 * @param root0
 * @param root0.config
 * @param root0.onError
 */
const OeeTrendWidget: React.FC<OeeTrendWidgetProps> = ({ config = {}, onError }) => {
  const machineId = (config.machineId as number) ?? null;
  const granularity = (config.granularity as Granularity) ?? 'day';
  const { data, isLoading, error } = useOeeTrendData(machineId, granularity);

  useEffect(() => {
    if (error && onError) {
      onError(new Error(`OEE Trend Widget error: ${error.message}`));
    }
  }, [error, onError]);

  if (!machineId) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Select a machine in widget settings
        </Typography>
      </Box>
    );
  }

  if (error)
    return (
      <Box sx={{ p: 2 }}>
        <Typography role="status">OEE history is unavailable.</Typography>
      </Box>
    );
  return <OeeTrendWidgetView data={data ?? []} isLoading={isLoading} />;
};

export default OeeTrendWidget;
