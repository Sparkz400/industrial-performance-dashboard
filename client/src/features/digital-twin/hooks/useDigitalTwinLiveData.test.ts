import { describe, expect, it } from 'vitest';
import { assetReading, type AssetReading } from './useDigitalTwinLiveData';
const now = Date.parse('2026-01-01T00:02:00Z');
const reading: AssetReading = {
  value: 0,
  rawValue: 0,
  statusCode: 'Good',
  timestamp: '2026-01-01T00:01:59Z',
  receivedAt: '2026-01-01T00:02:00Z',
};
describe('asset reading freshness', () => {
  it('keeps valid zero, Boolean and text readings', () => {
    expect(assetReading(reading, 'connected', true, now).value).toBe(0);
    expect(
      assetReading({ ...reading, value: false, rawValue: false }, 'connected', true, now).value,
    ).toBe(false);
    expect(assetReading({ ...reading, value: 'Ready' }, 'connected', true, now).value).toBe(
      'Ready',
    );
  });
  it('withholds stale, bad, future and missing-receipt values while retaining raw evidence', () => {
    for (const [patch, status] of [
      [{ timestamp: '2026-01-01T00:00:00Z' }, 'stale'],
      [{ statusCode: 'Bad' }, 'bad-quality'],
      [{ timestamp: '2026-01-02T00:00:00Z' }, 'clock-skew'],
      [{ receivedAt: null }, 'unknown'],
      [{ value: NaN }, 'unknown'],
    ] as const) {
      const result = assetReading({ ...reading, ...patch }, 'connected', true, now);
      expect(result.freshness).toBe(status);
      expect(result.value).toBeNull();
      expect(result.rawValue).toBe(0);
    }
  });
  it('never presents disconnected or failed-query data as current', () => {
    expect(assetReading(reading, 'disconnected', true, now).freshness).toBe('disconnected');
    expect(assetReading(reading, 'connected', false, now).freshness).toBe('unavailable');
  });
});
