import React, { memo, useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { ResponsiveLine } from '@nivo/line';
import type { WidgetConfig } from '@/types';

interface UptimeDataPoint {
  x: string;
  y: number;
}

interface NivoLineSeries {
  id: string;
  color: string;
  data: UptimeDataPoint[];
}

interface UptimeLineChartWidgetProps {
  config?: WidgetConfig;
}

const UptimeLineChartWidget = memo<UptimeLineChartWidgetProps>(({ config }) => {
  const expectedUptime = config?.expectedUptime || 99;
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const uptimeData = useMemo((): UptimeDataPoint[] => {
    const today = new Date();
    const points: UptimeDataPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      points.push({
        x: `${dd}.${mm}`,
        y: parseFloat((80 + Math.random() * 20).toFixed(1)),
      });
    }
    return points;
  }, []);

  const chartData = useMemo(
    (): NivoLineSeries[] => [
      { id: 'Uptime', color: '#6C63FF', data: uptimeData },
      {
        id: 'Expected',
        color: '#F44336',
        data: uptimeData.map((p) => ({ x: p.x, y: expectedUptime })),
      },
    ],
    [uptimeData, expectedUptime],
  );

  const nivoTheme = useMemo(
    () => ({
      text: { fill: isDark ? '#9DA3B4' : '#6B7280' },
      axis: {
        ticks: { text: { fill: isDark ? '#9DA3B4' : '#6B7280', fontSize: 11 } },
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

  const allValues = uptimeData.map((d) => d.y).concat(expectedUptime);
  const minY = Math.max(Math.min(...allValues) - 2, 0);
  const maxY = Math.min(Math.max(...allValues) + 2, 100);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Uptime Rate (Last 7 Days)
      </Typography>
      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0 }}>
        <ResponsiveLine
          data={chartData}
          theme={nivoTheme}
          margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: minY, max: maxY }}
          curve="monotoneX"
          colors={(d: { color: string }) => d.color}
          lineWidth={2}
          enablePoints={true}
          pointSize={8}
          pointColor={{ theme: 'background' }}
          pointBorderWidth={2}
          pointBorderColor={{ from: 'serieColor' }}
          enableArea={false}
          enableGridX={false}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            format: (v: number) => `${v}%`,
          }}
          useMesh={true}
          animate={true}
          motionConfig="gentle"
          legends={[
            {
              anchor: 'bottom',
              direction: 'row',
              translateY: 36,
              itemWidth: 100,
              itemHeight: 16,
              itemTextColor: isDark ? '#9DA3B4' : '#6B7280',
              symbolSize: 8,
              symbolShape: 'circle',
            },
          ]}
          defs={[
            {
              id: 'expected-line',
              type: 'patternLines',
              spacing: 4,
              rotation: -45,
              lineWidth: 1,
              color: '#F44336',
            },
          ]}
        />
      </Box>
    </Box>
  );
});

UptimeLineChartWidget.displayName = 'UptimeLineChartWidget';

export default UptimeLineChartWidget;
