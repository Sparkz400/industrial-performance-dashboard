import { useTheme } from '@mui/material/styles';
import { createChartTheme } from '@/theme/chartTheme';
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
import { ResponsiveLine, type LineSeries, type LineCustomSvgLayerProps } from '@nivo/line';
import { useSpcProfile, useSpcChartData, useSpcControlChart } from '../hooks/useSpcQueries';
import SpcAlertsList from '../components/SpcAlertsList';
import WidgetReadingEvidence from '@/features/widgets/types/WidgetReadingEvidence';
import { widgetReadings } from '@/features/widgets/hooks/widgetReadings';
import { localInput } from '@/features/operations/api';

const SpcChartPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const profileId = Number(id) || 0;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState(localInput(oneDayAgo.toISOString()));
  const [endDate, setEndDate] = useState(localInput(now.toISOString()));

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useSpcProfile(profileId);
  const {
    data: chartData,
    isLoading: chartLoading,
    error: chartError,
  } = useSpcChartData(
    profileId,
    Number.isFinite(Date.parse(startDate)) ? new Date(startDate).toISOString() : undefined,
    Number.isFinite(Date.parse(endDate)) ? new Date(endDate).toISOString() : undefined,
  );
  const controlChart = useSpcControlChart(
    profileId,
    Number.isFinite(Date.parse(startDate)) ? new Date(startDate).toISOString() : undefined,
    Number.isFinite(Date.parse(endDate)) ? new Date(endDate).toISOString() : undefined,
  );
  const readings = useMemo(
    () =>
      widgetReadings(
        (chartData?.dataPoints ?? []).map((point) => ({ ...point, time: point.timestamp })),
      ),
    [chartData],
  );

  const nivoData: LineSeries[] = useMemo(() => {
    if (!chartData?.dataPoints?.length) return [];
    return [
      {
        id: 'values',
        data: readings.map((p) => ({
          x: new Date(p.timestamp),
          y: p.value,
          isAnomaly:
            p.value != null &&
            chartData.ucl != null &&
            chartData.lcl != null &&
            (p.value > chartData.ucl || p.value < chartData.lcl),
        })),
      },
    ];
  }, [chartData, readings]);

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
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: 'center',
          mb: 3,
        }}
      >
        <IconButton onClick={() => navigate('/spc')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">{profile?.name ?? 'SPC Chart'}</Typography>
        {profile && (
          <Stack direction="row" spacing={1}>
            <Chip
              label={METHOD_LABELS[profile.method] ?? profile.method}
              size="small"
              variant="outlined"
            />
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
            <Stack
              direction="row"
              spacing={2}
              sx={{
                alignItems: 'center',
                ml: 'auto',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                }}
              >
                UCL: {profile.ucl?.toFixed(2) ?? '–'}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                }}
              >
                Mean: {profile.mean?.toFixed(2) ?? '–'}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                }}
              >
                LCL: {profile.lcl?.toFixed(2) ?? '–'}
              </Typography>
            </Stack>
          )}
        </Stack>

        <Typography role="status" variant="caption">
          Sampled observations; continuity is not verified. Bad readings and gaps longer than 60
          seconds remain unknown.{' '}
          {chartData?.truncated ? 'Truncated at 5000 observations; narrow the window.' : ''}
        </Typography>
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
                min:
                  chartData.lcl != null && chartData.ucl != null
                    ? chartData.lcl - (chartData.ucl - chartData.lcl) * 0.2
                    : 'auto',
                max:
                  chartData.ucl != null && chartData.lcl != null
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
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                    }}
                  >
                    {String(point.data.xFormatted)}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 'bold',
                    }}
                  >
                    Value: {Number(point.data.y).toFixed(3)}
                  </Typography>
                </Box>
              )}
              layers={layers as unknown as undefined}
              theme={createChartTheme(theme)}
            />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              No data points available for the selected time range.
            </Typography>
          </Box>
        )}
        <WidgetReadingEvidence rows={readings} />
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Declared control chart
        </Typography>
        {controlChart.error ? (
          <Typography
            sx={{
              color: 'text.secondary',
            }}
          >
            {(controlChart.error as Error).message}
          </Typography>
        ) : controlChart.data?.primary ? (
          <Stack spacing={1}>
            <Typography>
              {controlChart.data.chartType === 'xbar-r'
                ? `X̄-R chart, subgroups of ${controlChart.data.subgroupSize}`
                : 'I-MR chart'}{' '}
              · limits from approved reference {controlChart.data.baseline.id} (
              {controlChart.data.baseline.referencePoints} points)
            </Typography>
            <Box
              component="table"
              aria-label="Control limits"
              sx={{ borderCollapse: 'collapse', '& td, & th': { pr: 2, textAlign: 'left' } }}
            >
              <thead>
                <tr>
                  <th>Chart</th>
                  <th>LCL</th>
                  <th>Center</th>
                  <th>UCL</th>
                </tr>
              </thead>
              <tbody>
                {[controlChart.data.primary, controlChart.data.secondary].map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td>{l.lcl.toFixed(4)}</td>
                    <td>{l.center.toFixed(4)}</td>
                    <td>{l.ucl.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
            <Typography role="status">
              {controlChart.data.points.length} points;{' '}
              {controlChart.data.points.filter((p) => p.outOfControl).length} out of control
              {controlChart.data.truncated ? ' (window truncated)' : ''}.
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {controlChart.data.assumptions} {controlChart.data.specificationLimits}
            </Typography>
          </Stack>
        ) : null}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Recorded alerts for this profile (corrections do not rewrite past decisions)
        </Typography>
        <SpcAlertsList profileId={profileId} />
      </Paper>
    </Box>
  );
};

export default SpcChartPage;
