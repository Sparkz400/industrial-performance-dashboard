import { expect, it } from 'vitest';
import { toChartSeries } from './useTrendingData';

it('converts the actual series envelope without turning gaps into zero', () => {
  const result = toChartSeries({
    series: [
      {
        nodeKey: 'Temperature',
        displayName: 'Temperature',
        resolutionMs: 1000,
        sampleCount: 2,
        goodSampleCount: 1,
        continuity: 'unverified',
        data: [
          { timestamp: '2026-01-01T00:00:00.000Z', value: 0, statusCode: 'Good' },
          { timestamp: '2026-01-01T00:00:01.000Z', value: null, statusCode: 'Bad' },
        ],
      },
    ],
  });
  expect(result[0].data.map((point) => point.y)).toEqual([0, null]);
  expect(result[0].data[0].x).toBe('2026-01-01T00:00:00.000Z');
  expect(result[0].resolutionMs).toBe(1000);
  expect(result[0].continuity).toBe('unverified');
});
