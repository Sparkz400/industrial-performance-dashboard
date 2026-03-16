import React, { useMemo } from 'react';
import { Box, Typography, LinearProgress, CircularProgress, useTheme } from '@mui/material';

interface OeeGaugeWidgetViewProps {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  isLoading: boolean;
}

/**
 * Returns a color based on percentage thresholds.
 * @param value
 */
const getColor = (value: number): string => {
  if (value >= 85) return '#4caf50';
  if (value >= 60) return '#ff9800';
  return '#f44336';
};

const OeeGaugeWidgetView: React.FC<OeeGaugeWidgetViewProps> = ({
  oee,
  availability,
  performance,
  quality,
  isLoading,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const oeeColor = useMemo(() => getColor(oee), [oee]);

  if (isLoading) {
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
          Loading OEE data...
        </Typography>
      </Box>
    );
  }

  const metrics = [
    { label: 'Availability', value: availability },
    { label: 'Performance', value: performance },
    { label: 'Quality', value: quality },
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        p: 2,
      }}
    >
      {/* Circular gauge */}
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          mb: 2,
        }}
      >
        <CircularProgress
          variant="determinate"
          value={100}
          size={140}
          thickness={6}
          sx={{
            color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            position: 'absolute',
          }}
        />
        <CircularProgress
          variant="determinate"
          value={Math.min(oee, 100)}
          size={140}
          thickness={6}
          sx={{ color: oeeColor }}
        />
        <Box
          sx={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Typography variant="h3" fontWeight="bold" sx={{ color: oeeColor, lineHeight: 1 }}>
            {Math.round(oee)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            OEE %
          </Typography>
        </Box>
      </Box>

      {/* Metric bars */}
      <Box sx={{ width: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {metrics.map((metric) => (
          <Box key={metric.label}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {metric.label}
              </Typography>
              <Typography variant="body2" fontWeight="bold" sx={{ color: getColor(metric.value) }}>
                {Math.round(metric.value)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(metric.value, 100)}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  backgroundColor: getColor(metric.value),
                },
              }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default React.memo(OeeGaugeWidgetView);
