import { createChartTheme } from '@/theme/chartTheme';
import React, { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { Box, Typography, CircularProgress, useTheme } from '@mui/material';
import type { OeeTrendPoint } from './useOeeTrendData';
import OeeEvidence from '../oee-gauge/OeeEvidence';

interface OeeTrendWidgetViewProps {
  data: OeeTrendPoint[];
  isLoading: boolean;
}

const OeeTrendWidgetView: React.FC<OeeTrendWidgetViewProps> = ({ data, isLoading }) => {
  const theme = useTheme();
  const seriesConfig = useMemo(
    () => [
      { key: 'oee' as const, label: 'OEE', color: theme.palette.primary.main },
      { key: 'availability' as const, label: 'Availability', color: theme.palette.success.main },
      { key: 'performance' as const, label: 'Performance', color: theme.palette.info.main },
      { key: 'quality' as const, label: 'Quality', color: theme.palette.warning.main },
    ],
    [theme],
  );

  const nivoTheme = useMemo(() => createChartTheme(theme), [theme]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return seriesConfig.map((series) => ({
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
  }, [data, seriesConfig]);

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
      <OeeEvidence rows={data.map((point) => point.evidence)} />

      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, position: 'relative' }}>
        {chartData.length > 0 ? (
          <ResponsiveLine
            data={chartData}
            theme={nivoTheme}
            margin={{ top: 10, right: 20, bottom: 50, left: 50 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: 100 }}
            curve="monotoneX"
            colors={seriesConfig.map((s) => s.color)}
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
                itemTextColor: theme.palette.text.secondary,
              },
            ]}
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
              No OEE trend data available
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(OeeTrendWidgetView);
