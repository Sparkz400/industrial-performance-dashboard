import { createChartTheme } from '@/theme/chartTheme';
import React, { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { Typography, Box, CircularProgress, useTheme } from '@mui/material';
import type { OperationModeDataPoint } from './useOperationModeData';
import type { WidgetConfig } from '@/types';
import WidgetReadingEvidence from '../WidgetReadingEvidence';

interface NivoLineDataPoint {
  x: number;
  y: number | null;
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

  const nivoTheme = useMemo(() => createChartTheme(theme), [theme]);

  const chartData = useMemo((): NivoLineSeries[] => {
    if (!data || data.length === 0) return [];
    return [
      {
        id: 'Operation Mode',
        color: '#66BB6A',
        data: data.map((d) => ({ x: Date.parse(d.timestamp), y: d.mode })),
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
        <Typography variant="h6">Observed Operation Mode Codes</Typography>
        {loading && <CircularProgress size={20} sx={{ ml: 1 }} />}
      </Box>

      {error && (
        <Typography
          role="status"
          sx={{
            color: 'warning.main',
          }}
        >
          {error}
        </Typography>
      )}
      {lastUpdated && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
          }}
        >
          Last updated: {lastUpdated.toLocaleTimeString()}
        </Typography>
      )}

      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, position: 'relative' }}>
        {chartData.length > 0 ? (
          <ResponsiveLine
            data={chartData}
            theme={nivoTheme}
            margin={{ top: 10, right: 20, bottom: 40, left: 120 }}
            xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
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
              format: (value: number) => new Date(value).toLocaleTimeString(),
              tickSize: 0,
              tickPadding: 8,
              tickRotation: -45,
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 8,
              format: (v: number) => String(v),
            }}
            useMesh={true}
            animate={false}
            motionConfig="gentle"
            tooltip={({
              point,
            }: {
              point: { data: { x: string | number; y: string | number | null } };
            }) => (
              <Box
                sx={{
                  background: theme.palette.background.paper,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 1,
                  fontSize: '12px',
                }}
              >
                <strong>{new Date(Number(point.data.x)).toLocaleString()}</strong>
                <br />
                {point.data.y}
              </Box>
            )}
          />
        ) : (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              No operation mode data available
            </Typography>
          </Box>
        )}
      </Box>
      <WidgetReadingEvidence rows={data} />
    </Box>
  );
};

export default React.memo(OperationModeWidgetView);
