import React from 'react';
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OeeEvidence from './OeeEvidence';
it('shows actual coverage and discloses source timestamps are unavailable', () => {
  render(
    <OeeEvidence
      rows={[
        {
          oee: 0,
          availability: { availability: 0, unknownTimeMinutes: 17 },
          performance: { performance: 0, dataComplete: false },
          quality: { quality: 0, dataComplete: false },
          dataComplete: false,
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-01-01T01:00:00Z',
        },
      ]}
    />,
  );
  expect(screen.getByText('17')).toBeInTheDocument();
  expect(screen.getAllByText('Incomplete')).toHaveLength(2);
  expect(
    screen.getByText(/raw source and receive timestamps are not included/),
  ).toBeInTheDocument();
});
