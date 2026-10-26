import React, { useEffect, useMemo } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { ResponsiveLine, type LineSeries, type LineCustomSvgLayerProps } from '@nivo/line';
import { useSpcChartData } from '@/features/spc/hooks/useSpcQueries';
import type { WidgetConfig } from '@/types';

interface SpcChartWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

const SpcChartWidget: React.FC<SpcChartWidgetProps> = ({ config = {}, onError }) => {
  const profileId = (config.profileId as number) ?? 0;
  const { data, isLoading, error } = useSpcChartData(profileId);

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
        data: data.dataPoints.map((p) => ({
          x: new Date(p.timestamp),
          y: p.value,
          isAnomaly: p.isAnomaly,
        })),
      },
    ];
  }, [data]);

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
    <Box sx={{ width: '100%', height: '100%', p: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5, textAlign: 'center' }}>
        {data.profile.name}
      </Typography>
      <Box sx={{ width: '100%', height: 'calc(100% - 24px)' }}>
        <ResponsiveLine
          data={chartData}
          margin={{ top: 10, right: 70, bottom: 50, left: 60 }}
          xScale={{ type: 'time' }}
          xFormat="time:%Y-%m-%d %H:%M"
          yScale={{
            type: 'linear',
            min: data.lcl - (data.ucl - data.lcl) * 0.2,
            max: data.ucl + (data.ucl - data.lcl) * 0.2,
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
            return d?.isAnomaly ? '#f44336' : '#2196f3';
          }}
          pointBorderWidth={1}
          pointBorderColor={{ from: 'serieColor' }}
          colors={['#2196f3']}
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
          theme={{
            text: { fontFamily: 'var(--font-family)' },
            axis: {
              ticks: { text: { fontSize: 10 } },
              legend: { text: { fontSize: 12 } },
            },
          }}
        />
      </Box>
    </Box>
  );
};

export default SpcChartWidget;
