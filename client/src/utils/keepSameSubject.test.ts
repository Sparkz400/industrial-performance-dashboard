import { expect, it } from 'vitest';
import { keepSameSubject } from './keepSameSubject';

it('keeps data while only the time range changes, never across machines', () => {
  const keep = keepSameSubject(['oee', 1]);
  expect(keep('old', { queryKey: ['oee', 1, 't0', 't1'] })).toBe('old');
  expect(keep('old', { queryKey: ['oee', 2, 't0', 't1'] })).toBeUndefined();
  expect(keep('old', undefined)).toBeUndefined();
});
