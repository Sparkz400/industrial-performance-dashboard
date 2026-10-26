import { createChartTheme } from '@/theme/chartTheme';
import React, { useMemo, useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import {
  Box,
  Typography,
  CircularProgress,
  useTheme,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import type { TrendingSeries } from './useTrendingData';

interface TrendingExplorerWidgetViewProps {
  series: TrendingSeries[];
  isLoading: boolean;
}

const SERIES_COLORS = [
  '#B83D0C',
  '#4caf50',
  '#ff9800',
  '#8A7925',
  '#f44336',
  '#00bcd4',
  '#795548',
  '#607d8b',
];

const TrendingExplorerWidgetView: React.FC<TrendingExplorerWidgetViewProps> = ({
  series,
  isLoading,
}) => {
  const theme = useTheme();
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const nivoTheme = useMemo(() => createChartTheme(theme), [theme]);

  const filteredData = useMemo(
    () =>
      series
        .filter((s) => !hiddenSeries.has(s.id))
        .map((s, idx) => ({
          ...s,
          data: s.data.map((point) => ({ ...point, x: new Date(point.x) })),
          color: idx === 0 ? theme.palette.primary.main : SERIES_COLORS[idx % SERIES_COLORS.length],
        })),
    [series, hiddenSeries, theme.palette.primary.main],
  );

  const toggleSeries = (id: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (isLoading && series.length === 0) {
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
          Loading trending data...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {series.length > 0 && (
        <Box role="status" sx={{ px: 1 }}>
          <Typography variant="caption" display="block">
            Sampled observations. Continuity between samples is not verified; missing or bad values
            are gaps.
          </Typography>
          {series.map((s) => (
            <Typography
              key={s.id}
              variant="caption"
              display="block"
              color={s.truncated ? 'error' : 'text.secondary'}
            >
              {s.displayName}: {s.goodSampleCount ?? 0}/{s.sampleCount ?? 0} usable samples
              {' · '}
              {s.resolutionMs ? `${s.resolutionMs} ms buckets` : 'Raw samples'}
              {s.truncated ? ' · Truncated: narrow the window or request aggregation' : ''}
              {s.legacySampleCount ? ` · ${s.legacySampleCount} samples lack source identity` : ''}
              {s.observedEnd
                ? ` · Last sample ${new Date(s.observedEnd).toLocaleString()}`
                : ' · No observations'}
            </Typography>
          ))}
        </Box>
      )}
      {/* Legend with checkboxes */}
      {series.length > 0 && (
        <Box className="no-drag" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1, pt: 1 }}>
          {series.map((s, idx) => (
            <FormControlLabel
              key={s.id}
              control={
                <Checkbox
                  checked={!hiddenSeries.has(s.id)}
                  onChange={() => toggleSeries(s.id)}
                  size="small"
                  sx={{
                    color:
                      idx === 0
                        ? theme.palette.primary.main
                        : SERIES_COLORS[idx % SERIES_COLORS.length],
                    '&.Mui-checked': {
                      color:
                        idx === 0
                          ? theme.palette.primary.main
                          : SERIES_COLORS[idx % SERIES_COLORS.length],
                    },
                    p: 0.5,
                  }}
                />
              }
              label={
                <Typography variant="caption" noWrap>
                  {s.id}
                </Typography>
              }
              sx={{ mr: 1, ml: 0 }}
            />
          ))}
        </Box>
      )}

      {/* Chart */}
      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, position: 'relative' }}>
        {filteredData.length > 0 ? (
          <ResponsiveLine
            data={filteredData}
            theme={nivoTheme}
            margin={{ top: 10, right: 20, bottom: 50, left: 60 }}
            xScale={{ type: 'time', format: 'native', precision: 'millisecond', useUTC: true }}
            xFormat={(value) => new Date(value).toLocaleString()}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            curve="linear"
            colors={{ datum: 'color' }}
            lineWidth={2}
            enablePoints={true}
            pointSize={3}
            enableGridX={false}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 0,
              tickPadding: 8,
              tickRotation: -45,
              format: (value) => new Date(String(value)).toLocaleTimeString(),
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 8,
            }}
            useMesh={true}
            animate={true}
            motionConfig="gentle"
            enableSlices="x"
          />
        ) : (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <Typography variant="body2" color="text.secondary">
              {series.length === 0 ? 'Select tags to display' : 'All series hidden'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(TrendingExplorerWidgetView);
