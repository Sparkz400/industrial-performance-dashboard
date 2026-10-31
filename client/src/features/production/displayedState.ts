import type { MachineLiveSummary } from '@performance-dashboard/shared';
/**
 *
 * @param machine
 * @param updatedAt
 * @param now
 * @param failed
 */
export function displayedState(
  machine: Pick<MachineLiveSummary, 'state' | 'freshness'>,
  updatedAt: number,
  now: number,
  failed: boolean,
) {
  return failed || now - updatedAt > 15000 || machine.freshness !== 'fresh'
    ? 'unknown'
    : machine.state;
}
