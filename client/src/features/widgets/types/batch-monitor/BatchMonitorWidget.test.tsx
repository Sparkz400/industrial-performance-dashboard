import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('@/features/recipes/hooks/useBatchQueries', () => ({
  useActiveBatch: vi.fn(),
  useBatchData: vi.fn(),
}));
import { useActiveBatch, useBatchData } from '@/features/recipes/hooks/useBatchQueries';
import BatchMonitorWidget from './BatchMonitorWidget';

describe('batch measurement honesty', () => {
  it.each([
    ['Good', 0, 0, '0.00'],
    ['BadSensorFailure', 5, 0, 'Unknown'],
    ['Good', 5, 120000, 'Unknown'],
    ['Good', 5, -60000, 'Unknown'],
    ['Good', null, 0, 'Unknown'],
  ])('keeps %s %s at age %s explicit', (statusCode, value, age, expected) => {
    vi.mocked(useActiveBatch).mockReturnValue({
      data: {
        batchNumber: 'Fixture batch',
        status: 'running',
        startedAt: new Date().toISOString(),
      },
      isLoading: false,
    } as ReturnType<typeof useActiveBatch>);
    vi.mocked(useBatchData).mockReturnValue({
      data: [
        {
          nodeKey: 'Temperature',
          displayName: 'Temperature',
          targetValue: 5,
          tolerance: 1,
          dataPoints: [
            { timestamp: new Date(Date.now() - Number(age)).toISOString(), value, statusCode },
          ],
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useBatchData>);
    render(<BatchMonitorWidget config={{ machineId: 1 }} />);
    expect(screen.getByText(String(expected), { exact: true })).toBeVisible();
  });
});
