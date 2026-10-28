import { useTheme } from '@mui/material/styles';
import { createChartTheme } from '@/theme/chartTheme';
import React, { useEffect, useMemo } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { ResponsiveLine, type LineSeries, type LineCustomSvgLayerProps } from '@nivo/line';
import { useSpcChartData } from '@/features/spc/hooks/useSpcQueries';
import type { WidgetConfig } from '@/types';
import WidgetReadingEvidence from '../WidgetReadingEvidence';
import { widgetReadings } from '../../hooks/widgetReadings';
import { useTimeRangeStore } from '@/stores/useTimeRangeStore';

interface SpcChartWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

const SpcChartWidget: React.FC<SpcChartWidgetProps> = ({ config = {}, onError }) => {
  const theme = useTheme();
  const profileId = (config.profileId as number) ?? 0;
  const range = useTimeRangeStore((state) => state.timeRange);
  const { data, isLoading, error } = useSpcChartData(
    profileId,
    range.start?.toISOString(),
    range.end?.toISOString(),
  );
  const readings = useMemo(
    () =>
      widgetReadings(
        (data?.dataPoints ?? []).map((point) => ({ ...point, time: point.timestamp })),
      ),
    [data],
  );

  useEffect(() => {
    if (error && onError) {
      onError(new Error(`SPC Chart Widget error: ${error.message}`));
    }
  }, [error, onError]);

  const chartData: LineSeries[] = useMemo(() => {
    if (!data?.dataPoints) return [];

    return [
      {
        id: 'values',
        data: readings.map((p) => ({
          x: new Date(p.timestamp),
          y: p.value,
          isAnomaly:
            p.value != null &&
            data.ucl != null &&
            data.lcl != null &&
            (p.value > data.ucl || p.value < data.lcl),
        })),
      },
    ];
  }, [data, readings]);

  // Custom layer to draw UCL, LCL, and mean horizontal lines
  const controlLimitsLayer = useMemo(() => {
    if (!data) return undefined;

    const ControlLimitsLayer = ({ yScale, innerWidth }: LineCustomSvgLayerProps<LineSeries>) => {
      const lines = [
        { value: data.ucl, label: 'UCL', color: '#f44336', dash: '6,3' },
        { value: data.mean, label: 'CL', color: '#2196f3', dash: '4,4' },
        { value: data.lcl, label: 'LCL', color: '#f44336', dash: '6,3' },
      ];

      return (
        <g>
          {lines.map((line) => {
            const y = (yScale as (v: number) => number)(line.value);
            if (typeof y !== 'number' || isNaN(y)) return null;
            return (
              <g key={line.label}>
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={y}
                  y2={y}
                  stroke={line.color}
                  strokeWidth={1.5}
                  strokeDasharray={line.dash}
                />
                <text
                  x={innerWidth + 4}
                  y={y}
                  fill={line.color}
                  fontSize={10}
                  dominantBaseline="central"
                >
                  {line.label} ({line.value.toFixed(2)})
                </text>
              </g>
            );
          })}
        </g>
      );
    };
    ControlLimitsLayer.displayName = 'ControlLimitsLayer';
    return ControlLimitsLayer;
  }, [data]);

  if (!profileId) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Select an SPC profile in widget settings
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error)
    return (
      <Box sx={{ p: 2 }}>
        <Typography role="status">SPC history is unavailable.</Typography>
      </Box>
    );

  if (!data || !data.dataPoints.length) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No SPC data available for this profile.
        </Typography>
      </Box>
    );
  }

  const layers = controlLimitsLayer
    ? (['grid', 'axes', controlLimitsLayer, 'lines', 'points', 'mesh', 'legends'] as const)
    : undefined;

  return (
    <Box sx={{ width: '100%', height: '100%', p: 1, overflow: 'auto' }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5, textAlign: 'center' }}>
        {data.profile.name}
      </Typography>
      <Typography role="status" variant="caption">
        Sampled observations; continuity is not verified. Bad readings and gaps longer than 60
        seconds remain unknown.{' '}
        {data.truncated ? 'Truncated at 5000 observations; narrow the requested window.' : ''}
      </Typography>
      <Typography variant="caption" display="block">
        Window: {data.start ?? 'Unknown'} — {data.end ?? 'Unknown'}. Current projected measurements
        against stored limits; corrections do not rewrite recorded alert decisions.
      </Typography>
      <Box sx={{ width: '100%', height: '65%', minHeight: 160 }}>
        <ResponsiveLine
          data={chartData}
          margin={{ top: 10, right: 70, bottom: 50, left: 60 }}
          xScale={{ type: 'time' }}
          xFormat="time:%Y-%m-%d %H:%M"
          yScale={{
            type: 'linear',
            min: 'auto',
            max: 'auto',
          }}
          axisBottom={{
            format: '%H:%M',
            tickRotation: -45,
            legend: 'Time',
            legendOffset: 40,
            legendPosition: 'middle',
          }}
          axisLeft={{
            legend: 'Value',
            legendOffset: -50,
            legendPosition: 'middle',
          }}
          enablePoints
          pointSize={6}
          pointColor={(point: Record<string, unknown>) => {
            const d = (point as { data?: { isAnomaly?: boolean } }).data;
            return d?.isAnomaly ? theme.palette.error.main : theme.palette.primary.main;
          }}
          pointBorderWidth={1}
          pointBorderColor={{ from: 'serieColor' }}
          colors={[theme.palette.primary.main]}
          lineWidth={1.5}
          useMesh
          enableSlices={false}
          tooltip={({ point }) => (
            <Box
              sx={{
                bgcolor: 'background.paper',
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                boxShadow: 1,
              }}
            >
              <Typography variant="caption" display="block">
                {String(point.data.xFormatted)}
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                Value: {Number(point.data.y).toFixed(3)}
              </Typography>
            </Box>
          )}
          layers={layers as unknown as undefined}
          theme={createChartTheme(theme)}
        />
      </Box>
      <WidgetReadingEvidence rows={readings} />
    </Box>
  );
};

export default SpcChartWidget;
