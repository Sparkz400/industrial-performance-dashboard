import React, { useState, useEffect, memo, useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { Box, Typography, useTheme } from '@mui/material';
import type { WidgetConfig } from '@/types';

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

const generateInitialData = (): AirDataPoint[] => {
  const data: AirDataPoint[] = [];
  const now = new Date();
  for (let i = 1440; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000);
    data.push({
      x: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      y: Math.floor(Math.random() * 100) + 100,
    });
  }
  return data;
};

const CurrentAirConsumptionWidget = memo<CurrentAirConsumptionWidgetProps>(
  ({ config: _config }) => {
    const [rawData, setRawData] = useState<AirDataPoint[]>(() => generateInitialData());
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    useEffect(() => {
      const interval = setInterval(() => {
        setRawData((prev) => {
          const newData = [...prev];
          newData.shift();
          const now = new Date();
          newData.push({
            x: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            y: Math.floor(Math.random() * 100) + 100,
          });
          return newData;
        });
      }, 60000);
      return () => clearInterval(interval);
    }, []);

    // Show last 60 points for performance
    const displayData = useMemo((): NivoLineSeries[] => {
      const sliced = rawData.slice(-60);
      return [
        {
          id: 'Air Consumption',
          color: '#6C63FF',
          data: sliced,
        },
      ];
    }, [rawData]);

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
          Live data - updates every minute. Showing last 60 points.
        </Typography>
      </Box>
    );
  },
);

CurrentAirConsumptionWidget.displayName = 'CurrentAirConsumptionWidget';

export default CurrentAirConsumptionWidget;
