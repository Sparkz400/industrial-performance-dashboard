import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('./useOeeData', () => ({ useOeeData: vi.fn() }));
import { useOeeData } from './useOeeData';
import OeeGaugeWidget from './OeeGaugeWidget';
it('does not display a confident OEE percentage when measurement coverage is incomplete', () => {
  vi.mocked(useOeeData).mockReturnValue({
    data: { oee: 90, dataComplete: false },
    isLoading: false,
  } as ReturnType<typeof useOeeData>);
  render(<OeeGaugeWidget config={{ machineId: 1 }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Incomplete measurement coverage');
  expect(screen.queryByText('90')).not.toBeInTheDocument();
});
it('displays validated percentages from the API', () => {
  vi.mocked(useOeeData).mockReturnValue({
    data: { oee: 72, availability: 90, performance: 80, quality: 100, dataComplete: true },
    isLoading: false,
  } as ReturnType<typeof useOeeData>);
  render(<OeeGaugeWidget config={{ machineId: 1 }} />);
  expect(screen.getByText('72')).toBeVisible();
  expect(screen.getByText('90%')).toBeVisible();
});
import React from 'react';
