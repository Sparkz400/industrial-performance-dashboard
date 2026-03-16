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
  '#2196f3',
  '#4caf50',
  '#ff9800',
  '#9c27b0',
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
  const isDark = theme.palette.mode === 'dark';
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(new Set(series.map((s) => s.id)));

  // Update visible series when the series list changes
  React.useEffect(() => {
    setVisibleSeries(new Set(series.map((s) => s.id)));
  }, [series]);

  const nivoTheme = useMemo(
    () => ({
      text: { fill: isDark ? '#9DA3B4' : '#6B7280' },
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

  const filteredData = useMemo(
    () =>
      series
        .filter((s) => visibleSeries.has(s.id))
        .map((s, idx) => ({
          ...s,
          color: SERIES_COLORS[idx % SERIES_COLORS.length],
        })),
    [series, visibleSeries],
  );

  const toggleSeries = (id: string) => {
    setVisibleSeries((prev) => {
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
      {/* Legend with checkboxes */}
      {series.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1, pt: 1 }}>
          {series.map((s, idx) => (
            <FormControlLabel
              key={s.id}
              control={
                <Checkbox
                  checked={visibleSeries.has(s.id)}
                  onChange={() => toggleSeries(s.id)}
                  size="small"
                  sx={{
                    color: SERIES_COLORS[idx % SERIES_COLORS.length],
                    '&.Mui-checked': {
                      color: SERIES_COLORS[idx % SERIES_COLORS.length],
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
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            curve="monotoneX"
            colors={{ datum: 'color' }}
            lineWidth={2}
            enablePoints={false}
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
