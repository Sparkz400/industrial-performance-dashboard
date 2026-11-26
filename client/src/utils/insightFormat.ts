import { translate as t } from '@/i18n';

// Display helpers for plant insights: a missing value is shown as missing, never as zero.

/**
 * Hours with one decimal; unknown stays "unknown", never zero.
 * @param seconds
 * @param unknown
 */
export const hours = (seconds: number | null, unknown: string) =>
  seconds == null ? unknown : (seconds / 3600).toFixed(1) + ' h';

/**
 * Whole parts; a missing count stays "—", never zero.
 * @param value
 */
export const parts = (value: number | null) => (value == null ? '—' : Math.round(value).toString());

/**
 * Money in the shown currency; unpriced amounts stay "not priced", never zero.
 * @param value
 * @param currency
 */
export const money = (value: number | null, currency: string | null) =>
  value == null || !currency
    ? t('Not priced')
    : value.toLocaleString(undefined, { style: 'currency', currency });
