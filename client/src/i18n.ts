import { create } from 'zustand';
import { german } from './translations/de';
const translations = new Map(Object.entries(german));
type Language = 'en' | 'de';
export const useLanguage = create<{
  language: Language;
  setLanguage: (language: Language) => void;
}>((set) => ({
  language: localStorage.getItem('language') === 'de' ? 'de' : 'en',
  setLanguage: (language) => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language;
    set({ language });
  },
}));
document.documentElement.lang = useLanguage.getState().language;
/**
 *
 * @param text
 * @param translation
 */
export function translate(text: string, translation?: string) {
  return useLanguage.getState().language === 'de'
    ? (translation ?? translations.get(text) ?? text)
    : text;
}
/**
 *
 */
export function useT() {
  useLanguage((s) => s.language);
  return translate;
}
// Display formatting follows the selected language; stored values and units never change.
/**
 * @param value
 * @param maximumFractionDigits
 */
export function formatNumber(value: number | null | undefined, maximumFractionDigits = 3) {
  return value == null || Number.isNaN(value)
    ? translate('Unknown', 'Unbekannt')
    : value.toLocaleString(useLanguage.getState().language, { maximumFractionDigits });
}
/**
 * @param ratio
 */
export function formatPercent(ratio: number | null | undefined) {
  return ratio == null || Number.isNaN(ratio)
    ? translate('Unavailable', 'Nicht verfügbar')
    : ratio.toLocaleString(useLanguage.getState().language, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}
/**
 * @param value
 */
export function formatDateTime(value: string | number | Date) {
  return new Date(value).toLocaleString(useLanguage.getState().language);
}
