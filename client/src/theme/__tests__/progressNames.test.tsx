import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CircularProgress, LinearProgress, ThemeProvider } from '@mui/material';
import { createModernTheme } from '../modernTheme';

// WCAG 4.1.2: an unnamed spinner failed axe on slow page loads in CI.
describe('progress indicators', () => {
  it('have an accessible name by default and keep a specific one', () => {
    render(
      <ThemeProvider theme={createModernTheme('light')}>
        <CircularProgress />
        <LinearProgress />
        <CircularProgress
          aria-label="Time until the next refresh"
          variant="determinate"
          value={40}
        />
      </ThemeProvider>,
    );
    expect(screen.getAllByRole('progressbar', { name: 'Loading' })).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Time until the next refresh' })).toBeTruthy();
  });
});
