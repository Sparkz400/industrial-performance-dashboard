import { expect, it } from 'vitest';
import { money } from '@/utils/insightFormat';

it('shows unpriced amounts as not priced, never as zero', () => {
  expect(money(null, 'EUR')).toBe('Not priced');
  expect(money(12, null)).toBe('Not priced');
  expect(money(0, 'EUR')).toMatch(/0/);
});
