import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ResponsiveLine,
  type LineSeries,
  type LineCustomSvgLayerProps,
} from '@nivo/line';
import { useSpcProfile, useSpcChartData } from '../hooks/useSpcQueries';
import SpcAlertsList from '../components/SpcAlertsList';

const SpcChartPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profileId = Number(id) || 0;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState(oneDayAgo.toISOString().slice(0, 16));
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 16));

  const { data: profile, isLoading: profileLoading, error: profileError } = useSpcProfile(profileId);
  const {
    data: chartData,
    isLoading: chartLoading,
    error: chartError,
  } = useSpcChartData(
    profileId,
    new Date(startDate).toISOString(),
    new Date(endDate).toISOString(),
  );

  const nivoData: LineSeries[] = useMemo(() => {
    if (!chartData?.dataPoints?.length) return [];
    return [
      {
        id: 'values',
        data: chartData.dataPoints.map((p) => ({
          x: new Date(p.timestamp),
          y: p.value,
          isAnomaly: p.isAnomaly,
        })),
      },
    ];
  }, [chartData]);

  const controlLimitsLayer = useMemo(() => {
    if (!chartData) return undefined;

    const ControlLimitsLayer = ({ yScale, innerWidth }: LineCustomSvgLayerProps<LineSeries>) => {
      const lines = [
        { value: chartData.ucl, label: 'UCL', color: '#f44336', dash: '6,3' },
        { value: chartData.mean, label: 'CL', color: '#2196f3', dash: '4,4' },
        { value: chartData.lcl, label: 'LCL', color: '#f44336', dash: '6,3' },
      ];

      return (
        <g>
          {lines.map((line) => {
            if (line.value == null) return null;
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
  }, [chartData]);

  const layers = controlLimitsLayer
    ? (['grid', 'axes', controlLimitsLayer, 'lines', 'points', 'mesh', 'legends'] as const)
    : undefined;

  const isLoading = profileLoading || chartLoading;
  const error = profileError || chartError;

  const METHOD_LABELS: Record<string, string> = {
    zscore: 'Z-Score',
    moving_avg: 'Moving Average',
    std_bands: 'Standard Bands (Western Electric)',
    cusum: 'CUSUM',
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate('/spc')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">
          {profile?.name ?? 'SPC Chart'}
        </Typography>
        {profile && (
          <Stack direction="row" spacing={1}>
            <Chip label={METHOD_LABELS[profile.method] ?? profile.method} size="small" variant="outlined" />
            <Chip label={`${profile.sensitivity}σ`} size="small" variant="outlined" />
            {profile.lastComputedAt ? (
              <Chip label="Baseline computed" size="small" color="success" variant="outlined" />
            ) : (
              <Chip label="No baseline" size="small" color="warning" variant="outlined" />
            )}
          </Stack>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Start"
            type="datetime-local"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="End"
            type="datetime-local"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {profile && (
            <Stack direction="row" spacing={2} alignItems="center" sx={{ ml: 'auto' }}>
              <Typography variant="body2" color="text.secondary">
                UCL: {profile.ucl?.toFixed(2) ?? '–'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Mean: {profile.mean?.toFixed(2) ?? '–'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                LCL: {profile.lcl?.toFixed(2) ?? '–'}
              </Typography>
            </Stack>
          )}
        </Stack>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : nivoData.length > 0 && chartData ? (
          <Box sx={{ height: 400 }}>
            <ResponsiveLine
              data={nivoData}
              margin={{ top: 10, right: 70, bottom: 50, left: 60 }}
              xScale={{ type: 'time' }}
              xFormat="time:%Y-%m-%d %H:%M"
              yScale={{
                type: 'linear',
                min: chartData.lcl != null && chartData.ucl != null
                  ? chartData.lcl - (chartData.ucl - chartData.lcl) * 0.2
                  : 'auto',
                max: chartData.ucl != null && chartData.lcl != null
                  ? chartData.ucl + (chartData.ucl - chartData.lcl) * 0.2
                  : 'auto',
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
                axis: {
                  ticks: { text: { fontSize: 10 } },
                  legend: { text: { fontSize: 12 } },
                },
              }}
            />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography variant="body2" color="text.secondary">
              No data points available for the selected time range.
            </Typography>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Alerts for this Profile
        </Typography>
        <SpcAlertsList profileId={profileId} />
      </Paper>
    </Box>
  );
};

export default SpcChartPage;
