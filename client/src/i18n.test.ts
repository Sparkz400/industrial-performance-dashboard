import { afterEach, expect, it } from 'vitest';
import { formatNumber, formatPercent, useLanguage } from './i18n';

afterEach(() => useLanguage.getState().setLanguage('en'));

it('formats decimals and percentages for the selected language without changing values', () => {
  useLanguage.getState().setLanguage('en');
  expect(formatNumber(1234.5678, 2)).toBe('1,234.57');
  expect(formatPercent(0.4333)).toBe('43.3%');
  expect(formatPercent(0.5)).toBe('50.0%');
  useLanguage.getState().setLanguage('de');
  expect(formatNumber(1234.5678, 2)).toBe('1.234,57');
  expect(formatPercent(0.4333)).toBe('43,3 %'); // German uses a non-breaking space
});

it('shows missing values as unknown rather than zero', () => {
  useLanguage.getState().setLanguage('de');
  expect(formatNumber(null)).toBe('Unbekannt');
  expect(formatNumber(Number.NaN)).toBe('Unbekannt');
  expect(formatPercent(undefined)).toBe('Nicht verfügbar');
  expect(formatNumber(0)).toBe('0');
});
