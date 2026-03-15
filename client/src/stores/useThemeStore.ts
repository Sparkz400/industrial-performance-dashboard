import { create } from 'zustand';

interface ThemeState {
  themeMode: 'dark' | 'light';
  useSystemTheme: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
  setUseSystemTheme: (value: boolean) => void;
}

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

let mediaQueryCleanup: (() => void) | null = null;

const getInitialTheme = (): 'dark' | 'light' => {
  const stored = localStorage.getItem('themeMode');
  if (stored === 'dark' || stored === 'light') return stored;
  const useSystemPref = localStorage.getItem('useSystemTheme') === 'true';
  if (useSystemPref) {
    return mediaQuery.matches ? 'dark' : 'light';
  }
  return 'dark';
};

export const useThemeStore = create<ThemeState>((set, get) => {
  // Set up initial system theme listener if enabled
  const initialUseSystem = localStorage.getItem('useSystemTheme') === 'true';
  if (initialUseSystem) {
    const handler = (e: MediaQueryListEvent) => {
      set({ themeMode: e.matches ? 'dark' : 'light' });
    };
    mediaQuery.addEventListener('change', handler);
    mediaQueryCleanup = () => mediaQuery.removeEventListener('change', handler);
  }

  return {
    themeMode: getInitialTheme(),
    useSystemTheme: initialUseSystem,

    toggleTheme: () => {
      const newMode = get().themeMode === 'dark' ? 'light' : 'dark';
      localStorage.setItem('themeMode', newMode);
      localStorage.setItem('useSystemTheme', 'false');
      if (mediaQueryCleanup) {
        mediaQueryCleanup();
        mediaQueryCleanup = null;
      }
      set({ themeMode: newMode, useSystemTheme: false });
    },

    setThemeMode: (mode) => {
      localStorage.setItem('themeMode', mode);
      localStorage.setItem('useSystemTheme', 'false');
      if (mediaQueryCleanup) {
        mediaQueryCleanup();
        mediaQueryCleanup = null;
      }
      set({ themeMode: mode, useSystemTheme: false });
    },

    setUseSystemTheme: (value) => {
      localStorage.setItem('useSystemTheme', value.toString());

      if (value) {
        // Clean up any previous listener
        if (mediaQueryCleanup) {
          mediaQueryCleanup();
          mediaQueryCleanup = null;
        }

        const handler = (e: MediaQueryListEvent) => {
          set({ themeMode: e.matches ? 'dark' : 'light' });
        };
        mediaQuery.addEventListener('change', handler);
        mediaQueryCleanup = () => mediaQuery.removeEventListener('change', handler);

        const mode = mediaQuery.matches ? 'dark' : 'light';
        set({ useSystemTheme: true, themeMode: mode });
      } else {
        if (mediaQueryCleanup) {
          mediaQueryCleanup();
          mediaQueryCleanup = null;
        }
        set({ useSystemTheme: false });
      }
    },
  };
});
