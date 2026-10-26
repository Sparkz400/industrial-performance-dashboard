import React, { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { Box, Typography, CircularProgress, useTheme } from '@mui/material';
import type { OeeTrendPoint } from './useOeeTrendData';

interface OeeTrendWidgetViewProps {
  data: OeeTrendPoint[];
  isLoading: boolean;
}

const SERIES_CONFIG = [
  { key: 'oee' as const, label: 'OEE', color: '#2196f3' },
  { key: 'availability' as const, label: 'Availability', color: '#4caf50' },
  { key: 'performance' as const, label: 'Performance', color: '#ff9800' },
  { key: 'quality' as const, label: 'Quality', color: '#9c27b0' },
];

const OeeTrendWidgetView: React.FC<OeeTrendWidgetViewProps> = ({ data, isLoading }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const nivoTheme = useMemo(
    () => ({
      text: { fontFamily: 'var(--font-family)', fill: isDark ? '#9DA3B4' : '#6B7280' },
      axis: {
        ticks: { text: { fill: isDark ? '#9DA3B4' : '#6B7280', fontSize: 10 } },
      },
      grid: { line: { stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' } },
      crosshair: { line: { stroke: '#2196f3', strokeWidth: 1, strokeDasharray: '6 6' } },
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

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return SERIES_CONFIG.map((series) => ({
      id: series.label,
      color: series.color,
      data: data.map((point) => ({
        x: new Date(point.timestamp).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        y: point.dataComplete ? point[series.key] : null,
      })),
    }));
  }, [data]);

  if (isLoading && data.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <CircularProgress size={40} />
        <Typography variant="body2" sx={{ mt: 2 }}>
          Loading OEE trend data...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">OEE Trend</Typography>
        {isLoading && <CircularProgress size={20} sx={{ ml: 1 }} />}
      </Box>
      {data.some((point) => !point.dataComplete) && (
        <Typography role="status" variant="caption">
          Gaps indicate incomplete measurement coverage.
        </Typography>
      )}

      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, position: 'relative' }}>
        {chartData.length > 0 ? (
          <ResponsiveLine
            data={chartData}
            theme={nivoTheme}
            margin={{ top: 10, right: 20, bottom: 50, left: 50 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: 100 }}
            curve="monotoneX"
            colors={SERIES_CONFIG.map((s) => s.color)}
            lineWidth={2}
            enablePoints={true}
            pointSize={4}
            pointColor={{ theme: 'background' }}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            enableGridX={false}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 0,
              tickPadding: 8,
              tickRotation: -45,
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
                translateY: 50,
                itemWidth: 100,
                itemHeight: 20,
                symbolSize: 10,
                symbolShape: 'circle',
                itemTextColor: isDark ? '#9DA3B4' : '#6B7280',
              },
            ]}
          />
        ) : (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <Typography variant="body2" color="text.secondary">
              No OEE trend data available
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(OeeTrendWidgetView);
