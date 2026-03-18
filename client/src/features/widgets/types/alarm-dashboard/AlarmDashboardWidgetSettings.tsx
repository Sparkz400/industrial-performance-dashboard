import React from 'react';
import { Box, Typography, Slider } from '@mui/material';
import type { WidgetConfig } from '@/types';

interface AlarmDashboardWidgetSettingsProps {
  config?: WidgetConfig;
  onConfigChange: (newConfig: WidgetConfig) => void;
}

// Minimal settings component
/**
 *
 * @param root0
 * @param root0.config
 * @param root0.onConfigChange
 */
function AlarmDashboardWidgetSettings({
  config,
  onConfigChange,
}: AlarmDashboardWidgetSettingsProps): React.ReactElement {
  const rowsPerPage = ((config || {}).rowsPerPage as number) ?? 5;

  const handleRowsChange = (_event: Event, newValue: number | number[]) => {
    onConfigChange({
      ...config,
      rowsPerPage: newValue as number,
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Alarm Dashboard Settings
      </Typography>

      <Box sx={{ mt: 2 }}>
        <Typography gutterBottom>Rows per page: {rowsPerPage}</Typography>
        <Slider value={rowsPerPage} step={5} marks min={5} max={25} onChange={handleRowsChange} />
      </Box>
    </Box>
  );
}

export default AlarmDashboardWidgetSettings;
