import React, { memo, useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { Box, Typography, useTheme } from '@mui/material';
import type { WidgetConfig } from '@/types';
import { useNodeData } from '../hooks/useNodeData';

interface AirDataPoint {
  x: string;
  y: number;
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
  const isDark = theme.palette.mode === 'dark';

  const nodeKey = (config?.nodeKey as string) ?? 'AirConsumption';
  const machineId = config?.machineId as number | undefined;

  const { data, loading, error } = useNodeData({
    nodeKey,
    machineId,
    maxPoints: 1440,
  });

  const displayData = useMemo((): NivoLineSeries[] => {
    const sliced = data.slice(-60).map((pt) => ({
      x: pt.time,
      y: pt.value ?? 0,
    }));
    return [
      {
        id: 'Air Consumption',
        color: '#6C63FF',
        data: sliced,
      },
    ];
  }, [data]);

  const nivoTheme = useMemo(
    () => ({
      text: { fill: isDark ? '#9DA3B4' : '#6B7280' },
      axis: {
        ticks: { text: { fill: isDark ? '#9DA3B4' : '#6B7280', fontSize: 10 } },
        legend: { text: { fill: isDark ? '#9DA3B4' : '#6B7280', fontSize: 12 } },
      },
      grid: { line: { stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' } },
      crosshair: { line: { stroke: '#6C63FF', strokeWidth: 1, strokeDasharray: '6 6' } },
      tooltip: {
        container: {
          background: isDark ? '#1E2130' : '#ffffff',
          color: isDark ? '#E8E8ED' : '#1A1A2E',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          fontSize: '12px',
        },
      },
    }),
    [isDark],
  );

  if (loading && data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="text.secondary">Loading...</Typography>
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
        Air Consumption (24H)
      </Typography>
      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0 }}>
        <ResponsiveLine
          data={displayData}
          theme={nivoTheme}
          margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
          curve="monotoneX"
          colors={['#6C63FF']}
          lineWidth={2}
          enablePoints={false}
          enableArea={true}
          areaOpacity={0.15}
          areaBlendMode="normal"
          enableGridX={false}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
            tickRotation: -45,
            tickValues: 'every 10',
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            format: (v: number) => `${v}`,
          }}
          useMesh={true}
          animate={true}
          motionConfig="gentle"
          defs={[
            {
              id: 'gradient',
              type: 'linearGradient',
              colors: [
                { offset: 0, color: '#6C63FF', opacity: 0.4 },
                { offset: 100, color: '#6C63FF', opacity: 0 },
              ],
            },
          ]}
          fill={[{ match: '*', id: 'gradient' }]}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Live data — updates in real-time via OPC-UA. Showing last 60 points.
      </Typography>
    </Box>
  );
});

CurrentAirConsumptionWidget.displayName = 'CurrentAirConsumptionWidget';

export default CurrentAirConsumptionWidget;
