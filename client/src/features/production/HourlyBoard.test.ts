import { expect, it } from 'vitest';
import { parts } from '@/utils/insightFormat';

it('shows unknown counts as a dash, never as zero', () => {
  expect(parts(null)).toBe('—');
  expect(parts(0)).toBe('0');
  expect(parts(119.6)).toBe('120');
});
