import type { Theme } from '@mui/material/styles';

export const createChartTheme = (theme: Theme) => ({
  text: { fontFamily: 'var(--font-family)', fill: theme.palette.text.secondary, fontSize: 11 },
  axis: {
    domain: { line: { stroke: theme.palette.divider } },
    ticks: {
      line: { stroke: theme.palette.divider },
      text: { fill: theme.palette.text.secondary, fontSize: 11 },
    },
    legend: { text: { fill: theme.palette.text.primary, fontSize: 12 } },
  },
  labels: { text: { fill: theme.palette.text.primary, fontSize: 11 } },
  legends: { text: { fill: theme.palette.text.secondary, fontSize: 11 } },
  grid: { line: { stroke: theme.palette.divider } },
  crosshair: {
    line: { stroke: theme.palette.primary.main, strokeWidth: 1, strokeDasharray: '6 6' },
  },
  tooltip: {
    container: {
      fontFamily: 'var(--font-family)',
      background: theme.palette.background.paper,
      color: theme.palette.text.primary,
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 4,
      fontSize: 12,
      boxShadow: '0 2px 6px #00000025',
    },
  },
});
