import React, { useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useOeeData } from './useOeeData';
import OeeGaugeWidgetView from './OeeGaugeWidgetView';
import type { WidgetConfig } from '@/types';
import OeeEvidence from './OeeEvidence';

interface OeeGaugeWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

/**
 * Container component for OEE Gauge Widget
 * @param root0
 * @param root0.config
 * @param root0.onError
 */
const OeeGaugeWidget: React.FC<OeeGaugeWidgetProps> = ({ config = {}, onError }) => {
  const machineId = (config.machineId as number) ?? null;
  const { data, isLoading, error } = useOeeData(machineId);

  useEffect(() => {
    if (error && onError) {
      onError(new Error(`OEE Gauge Widget error: ${error.message}`));
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
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
          }}
        >
          Select a machine in widget settings
        </Typography>
      </Box>
    );
  }

  if (error || !data || !data.dataComplete) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography role="status">
          {isLoading
            ? 'Loading measured OEE…'
            : error
              ? 'OEE data unavailable'
              : 'Incomplete measurement coverage — OEE is unavailable for this period.'}
        </Typography>
        {!error && data && <OeeEvidence rows={[data.evidence]} />}
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <OeeGaugeWidgetView
        oee={data.oee}
        availability={data.availability}
        performance={data.performance}
        quality={data.quality}
        isLoading={isLoading}
      />
      <OeeEvidence rows={[data.evidence]} />
    </Box>
  );
};

export default OeeGaugeWidget;
