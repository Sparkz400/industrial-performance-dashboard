import { describe, expect, it } from 'vitest';
import { csvCell } from './csv';

describe('csvCell', () => {
  it('quotes every cell and doubles quotes, so commas and quotes keep columns aligned', () => {
    expect(csvCell('Press, "line 2"')).toBe('"Press, ""line 2"""');
    expect(['a', 'b,c', 3].map(csvCell).join(',')).toBe('"a","b,c","3"');
  });

  it('neutralizes text that a spreadsheet would run as a formula', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell(-5)).toBe('"-5"');
  });

  it('keeps unknown values empty rather than writing null', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});
