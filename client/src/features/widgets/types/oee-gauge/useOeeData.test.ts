import { expect, it } from 'vitest';
import { toOeeDisplay } from './useOeeData';
it('converts nested API ratios into percentages while preserving missing-data state', () => {
  expect(
    toOeeDisplay({
      oee: 0.72,
      availability: { availability: 0.9 },
      performance: { performance: 0.8 },
      quality: { quality: 1 },
      dataComplete: false,
    }),
  ).toEqual({ oee: 72, availability: 90, performance: 80, quality: 100, dataComplete: false });
});
