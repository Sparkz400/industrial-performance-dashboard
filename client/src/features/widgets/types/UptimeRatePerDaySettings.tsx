import React from 'react';
import { Slider, Typography, Box } from '@mui/material';
import type { WidgetConfig } from '@/types';

interface UptimeRatePerDaySettingsProps {
  config?: WidgetConfig;
  onConfigChange: (newConfig: WidgetConfig) => void;
}

const UptimeRatePerDaySettings: React.FC<UptimeRatePerDaySettingsProps> = ({
  config = {},
  onConfigChange,
}) => {
  // The current expected uptime, defaulting to 99 if not provided
  const expectedUptime = config.expectedUptime || 99;

  const handleChange = (_event: Event, newValue: number | number[]) => {
    onConfigChange({ ...config, expectedUptime: newValue as number });
  };

  return (
    <Box sx={{ padding: 2 }}>
      <Typography gutterBottom>Expected Uptime (%)</Typography>
      <Slider
        value={expectedUptime}
        min={0}
        max={100}
        step={0.1}
        onChange={handleChange}
        valueLabelDisplay="auto"
      />
    </Box>
  );
};

export default UptimeRatePerDaySettings;
