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
