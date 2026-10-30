import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { ShiftReport } from '@performance-dashboard/shared';
import ShiftTimeline from './ShiftTimeline';

it('keeps unknown, planned and observed state durations separate', () => {
  render(
    <ShiftTimeline
      report={
        {
          start: '2026-10-30T08:00:00Z',
          end: '2026-10-30T09:00:00Z',
          timezone: 'UTC',
          intervals: [
            { start: '2026-10-30T08:00:00Z', end: '2026-10-30T08:30:00Z', state: 'running' },
            { start: '2026-10-30T08:30:00Z', end: '2026-10-30T08:40:00Z', state: 'planned' },
            { start: '2026-10-30T08:40:00Z', end: '2026-10-30T09:00:00Z', state: 'unknown' },
          ],
          seconds: { running: 1800, planned: 600, unknown: 1200, idle: 0, fault: 0 },
        } as ShiftReport
      }
    />,
  );
  expect(screen.getByText('running').nextElementSibling).toHaveTextContent('30 min');
  expect(screen.getByText('planned').nextElementSibling).toHaveTextContent('10 min');
  expect(screen.getByText('unknown').nextElementSibling).toHaveTextContent('20 min');
  expect(screen.getByText(/Unknown time is not downtime/)).toBeVisible();
  expect(screen.getByRole('img')).toHaveAccessibleName(/Durations are listed below/);
});
