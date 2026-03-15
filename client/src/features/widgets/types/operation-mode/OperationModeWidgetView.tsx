import React, { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { Typography, Box, CircularProgress, useTheme } from '@mui/material';
import type { OperationModeDataPoint } from './useOperationModeData';
import type { WidgetConfig } from '@/types';

export const modeMapping: Record<number, string> = {
  0: 'Off',
  1: 'Error State',
  2: 'Setup Mode',
  3: 'Auto (Not Started)',
  4: 'Auto (Started & Idle)',
  5: 'Auto (In Production)',
};

interface NivoLineDataPoint {
  x: string;
  y: number;
}

interface NivoLineSeries {
  id: string;
  color: string;
  data: NivoLineDataPoint[];
}

interface OperationModeWidgetViewProps {
  data?: OperationModeDataPoint[];
  loading?: boolean;
  error?: string | null;
  lastUpdated?: Date | null;
  config?: WidgetConfig;
  onRefresh?: () => void;
}

const OperationModeWidgetView: React.FC<OperationModeWidgetViewProps> = ({
  data = [],
  loading = false,
  error = null,
  lastUpdated = null,
  config: _config = { maxPoints: 120, showBrush: true },
  onRefresh = () => {},
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const nivoTheme = useMemo(
    () => ({
      text: { fill: isDark ? '#9DA3B4' : '#6B7280' },
      axis: {
        ticks: { text: { fill: isDark ? '#9DA3B4' : '#6B7280', fontSize: 10 } },
      },
      grid: { line: { stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' } },
      crosshair: { line: { stroke: '#66BB6A', strokeWidth: 1, strokeDasharray: '6 6' } },
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

  const chartData = useMemo((): NivoLineSeries[] => {
    if (!data || data.length === 0) return [];
    return [
      {
        id: 'Operation Mode',
        color: '#66BB6A',
        data: data.map((d) => ({ x: d.time, y: d.mode })),
      },
    ];
  }, [data]);

  if (loading && data.length === 0) {
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
          Loading operation mode data...
        </Typography>
      </Box>
    );
  }

  if (error && data.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', p: 2 }}>
        <Typography variant="h6" color="error" gutterBottom>
          Error Loading Data
        </Typography>
        <Typography variant="body2">{error}</Typography>
        <Box sx={{ mt: 2 }}>
          <button onClick={onRefresh} className="no-drag">
            Retry
          </button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Operation Mode Over Time</Typography>
        {loading && <CircularProgress size={20} sx={{ ml: 1 }} />}
      </Box>

      {lastUpdated && (
        <Typography variant="caption" color="text.secondary">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </Typography>
      )}

      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, position: 'relative' }}>
        {chartData.length > 0 ? (
          <ResponsiveLine
            data={chartData}
            theme={nivoTheme}
            margin={{ top: 10, right: 20, bottom: 40, left: 120 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: 5 }}
            curve="stepAfter"
            colors={['#66BB6A']}
            lineWidth={2}
            enablePoints={true}
            pointSize={6}
            pointColor={{ theme: 'background' }}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            enableArea={true}
            areaOpacity={0.1}
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
              tickValues: [0, 1, 2, 3, 4, 5],
              // eslint-disable-next-line security/detect-object-injection -- v is a numeric axis tick value
              format: (v: number) => modeMapping[v] || String(v),
            }}
            useMesh={true}
            animate={true}
            motionConfig="gentle"
            tooltip={({
              point,
            }: {
              point: { data: { x: string | number; y: string | number } };
            }) => (
              <Box
                sx={{
                  background: isDark ? '#1E2130' : '#fff',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 1,
                  fontSize: '12px',
                }}
              >
                <strong>{point.data.x}</strong>
                <br />
                {modeMapping[point.data.y as number] || point.data.y}
              </Box>
            )}
          />
        ) : (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <Typography variant="body2" color="text.secondary">
              No operation mode data available
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(OperationModeWidgetView);
