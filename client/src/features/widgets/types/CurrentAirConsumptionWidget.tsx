import { createChartTheme } from '@/theme/chartTheme';
import React, { memo, useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { Box, Typography, useTheme } from '@mui/material';
import type { WidgetConfig } from '@/types';
import { useNodeData } from '../hooks/useNodeData';
import WidgetReadingEvidence from './WidgetReadingEvidence';

interface AirDataPoint {
  x: number;
  y: number | null;
}

interface NivoLineSeries {
  id: string;
  color: string;
  data: AirDataPoint[];
}

interface CurrentAirConsumptionWidgetProps {
  config?: WidgetConfig;
}

const CurrentAirConsumptionWidget = memo<CurrentAirConsumptionWidgetProps>(({ config }) => {
  const theme = useTheme();

  const nodeKey = (config?.nodeKey as string) ?? 'AirConsumption';
  const machineId = config?.machineId as number | undefined;

  const { data, loading, error, freshness } = useNodeData({
    nodeKey,
    machineId,
    maxPoints: 1440,
  });

  const displayData = useMemo((): NivoLineSeries[] => {
    const sliced = data.slice(-60).map((pt) => ({
      x: Date.parse(pt.timestamp),
      y: pt.value,
    }));
    return [
      {
        id: 'Air Consumption',
        color: theme.palette.primary.main,
        data: sliced,
      },
    ];
  }, [data, theme.palette.primary.main]);

  const nivoTheme = useMemo(() => createChartTheme(theme), [theme]);

  if (loading && data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography
          sx={{
            color: 'text.secondary',
          }}
        >
          Loading...
        </Typography>
      </Box>
    );
  }

  if (error && data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="error">Error: {error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Observed Air Consumption
      </Typography>
      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0 }}>
        <ResponsiveLine
          data={displayData}
          theme={nivoTheme}
          margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
          xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
          yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
          curve="linear"
          colors={[theme.palette.primary.main]}
          lineWidth={2}
          enablePoints={true}
          enableArea={true}
          areaOpacity={0.15}
          areaBlendMode="normal"
          enableGridX={false}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            format: (value: number) => new Date(value).toLocaleTimeString(),
            tickSize: 0,
            tickPadding: 8,
            tickRotation: -45,
            tickValues: 5,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            format: (v: number) => `${v}`,
          }}
          useMesh={true}
          animate={false}
          motionConfig="gentle"
          defs={[
            {
              id: 'gradient',
              type: 'linearGradient',
              colors: [
                { offset: 0, color: theme.palette.primary.main, opacity: 0.4 },
                { offset: 100, color: theme.palette.primary.main, opacity: 0 },
              ],
            },
          ]}
          fill={[{ match: '*', id: 'gradient' }]}
        />
      </Box>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
        }}
      >
        Current reading: {freshness}. Last 60 observed samples; gaps remain unknown.
      </Typography>
      <WidgetReadingEvidence rows={data} />
    </Box>
  );
});

CurrentAirConsumptionWidget.displayName = 'CurrentAirConsumptionWidget';

export default CurrentAirConsumptionWidget;
