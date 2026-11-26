import { expect, it } from 'vitest';
import { hours } from '@/utils/insightFormat';

it('shows unknown MTBF/MTTR as unknown, never as zero hours', () => {
  expect(hours(null, 'Unknown')).toBe('Unknown');
  expect(hours(5400, 'Unknown')).toBe('1.5 h');
  expect(hours(0, 'Unknown')).toBe('0.0 h');
});
