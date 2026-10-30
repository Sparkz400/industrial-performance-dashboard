import { describe, it, expect } from 'vitest';
import { isSameDashboardContent } from './useDashboardState';

// As PostgreSQL JSONB returns it: keys reordered, no registry constraints.
const stored = {
  widgets: [{ id: 'c', type: 'systemStatus', config: { showDetails: true, autoRefresh: false } }],
  layout: [{ h: 6, i: 'c', w: 4, x: 0, y: 0 }],
};

describe('isSameDashboardContent', () => {
  it('treats store and grid reshaping of an untouched dashboard as unchanged', () => {
    const inStore = {
      widgets: [
        { id: 'c', type: 'systemStatus', config: { autoRefresh: false, showDetails: true } },
      ],
      layout: [{ i: 'c', x: 0, y: 0, w: 4, h: 6, minW: 2, minH: 2, moved: false, static: false }],
    };
    expect(isSameDashboardContent(stored, inStore)).toBe(true);
  });

  it('ignores layout order but not geometry, widgets or configuration', () => {
    const two = {
      widgets: [...stored.widgets, { id: 'd', type: 'systemStatus', config: {} }],
      layout: [...stored.layout, { i: 'd', x: 4, y: 0, w: 4, h: 6 }],
    };
    expect(isSameDashboardContent(two, { ...two, layout: [...two.layout].reverse() })).toBe(true);
    for (const change of [{ x: 4 }, { y: 1 }, { w: 5 }, { h: 7 }]) {
      expect(
        isSameDashboardContent(stored, { ...stored, layout: [{ ...stored.layout[0], ...change }] }),
      ).toBe(false);
    }
    expect(isSameDashboardContent(stored, { ...stored, widgets: [] })).toBe(false);
    expect(
      isSameDashboardContent(stored, {
        ...stored,
        widgets: [{ ...stored.widgets[0], config: { showDetails: false, autoRefresh: false } }],
      }),
    ).toBe(false);
  });
});
