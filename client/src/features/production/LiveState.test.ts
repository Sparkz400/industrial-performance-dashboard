import { describe, it, expect } from 'vitest';
import { displayedState } from './displayedState';
describe('live state disclosure', () => {
  it('does not show running after stale responses or bad measurements', () => {
    expect(displayedState({ state: 'running', freshness: 'fresh' }, 1000, 16001, false)).toBe(
      'unknown',
    );
    expect(displayedState({ state: 'running', freshness: 'bad-quality' }, 1000, 1001, false)).toBe(
      'unknown',
    );
    expect(displayedState({ state: 'running', freshness: 'fresh' }, 1000, 1001, true)).toBe(
      'unknown',
    );
    expect(displayedState({ state: 'running', freshness: 'fresh' }, 1000, 1001, false)).toBe(
      'running',
    );
  });
});
