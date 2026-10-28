import { describe, it, expect } from 'vitest';
import { widgetReadings } from './widgetReadings';
describe('widget evidence', () => {
  it('preserves zero, exposes bad quality as unknown, keeps original evidence', () => {
    const rows = widgetReadings([
      { timestamp: '2026-01-01T00:00:00Z', time: '0', value: 0, statusCode: 'Good' },
      { timestamp: '2026-01-01T00:00:01Z', time: '1', value: 12, rawValue: 12, statusCode: 'Bad' },
    ]);
    expect(rows[0].value).toBe(0);
    expect(rows[1].value).toBeNull();
    expect(rows[1].rawValue).toBe(12);
  });
  it('sorts out-of-order samples and inserts an unknown gap rather than joining it', () => {
    const rows = widgetReadings([
      { timestamp: '2026-01-01T00:02:00Z', time: '2', value: 2, statusCode: 'Good' },
      { timestamp: '2026-01-01T00:00:00Z', time: '0', value: 1, statusCode: 'Good' },
    ]);
    expect(rows.map((row) => row.value)).toEqual([1, null, 2]);
  });
  it('does not promote source clock faults to valid measured chart points', () => {
    const rows = widgetReadings([
      {
        timestamp: '2026-01-01T00:00:00Z',
        time: '0',
        value: 1,
        statusCode: 'Good',
        sourceTimestamp: '2026-01-01T00:01:00Z',
        rawValue: 1,
      },
    ]);
    expect(rows[0].value).toBeNull();
    expect(rows[0].rawValue).toBe(1);
  });
});
