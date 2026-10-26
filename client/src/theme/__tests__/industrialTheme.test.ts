import { describe, expect, it } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import { createModernTheme } from '../modernTheme';
import { createChartTheme } from '../chartTheme';

describe.each(['light', 'dark'] as const)('industrial %s theme', (mode) => {
  const theme = createModernTheme(mode);
  const field = mode === 'dark' ? '#141B1F' : '#F8FAFB';

  it('keeps text readable on chassis, raised panels and recessed charts', () => {
    for (const surface of [
      theme.palette.background.default,
      theme.palette.background.paper,
      field,
    ]) {
      expect(getContrastRatio(theme.palette.text.primary, surface)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(theme.palette.text.secondary, surface)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(theme.palette.primary.main, surface)).toBeGreaterThanOrEqual(3);
    }
    expect(
      getContrastRatio(theme.palette.primary.main, theme.palette.primary.contrastText),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      getContrastRatio(theme.palette.secondary.main, theme.palette.secondary.contrastText),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('carries the shared font and readable labels into charts and tooltips', () => {
    const chart = createChartTheme(theme);
    expect(chart.text.fontFamily).toBe('var(--font-family)');
    expect(getContrastRatio(chart.axis.ticks.text.fill, field)).toBeGreaterThanOrEqual(4.5);
    expect(
      getContrastRatio(chart.tooltip.container.color, chart.tooltip.container.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(theme.palette.primary.main).toBe(mode === 'dark' ? '#FF9B70' : '#B83D0C');
  });
});
