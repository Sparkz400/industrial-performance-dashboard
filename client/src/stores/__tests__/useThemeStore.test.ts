import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// Mock window.matchMedia before importing the store
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    dispatchEvent: vi.fn(),
  })),
});

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
    // Reset module registry so the store is re-created fresh
    vi.resetModules();
  });

  /**
   *
   */
  async function getStore() {
    const { useThemeStore } = await import('../useThemeStore');
    return useThemeStore;
  }

  it('should default to dark theme when nothing is stored', async () => {
    const useThemeStore = await getStore();
    const state = useThemeStore.getState();
    expect(state.themeMode).toBe('dark');
    expect(state.useSystemTheme).toBe(false);
  });

  it('should restore stored theme mode from localStorage', async () => {
    localStorage.setItem('themeMode', 'light');
    const useThemeStore = await getStore();
    expect(useThemeStore.getState().themeMode).toBe('light');
  });

  it('toggleTheme should switch from dark to light', async () => {
    const useThemeStore = await getStore();
    expect(useThemeStore.getState().themeMode).toBe('dark');

    act(() => {
      useThemeStore.getState().toggleTheme();
    });

    expect(useThemeStore.getState().themeMode).toBe('light');
    expect(localStorage.getItem('themeMode')).toBe('light');
  });

  it('toggleTheme should switch from light to dark', async () => {
    localStorage.setItem('themeMode', 'light');
    const useThemeStore = await getStore();

    act(() => {
      useThemeStore.getState().toggleTheme();
    });

    expect(useThemeStore.getState().themeMode).toBe('dark');
    expect(localStorage.getItem('themeMode')).toBe('dark');
  });

  it('toggleTheme should disable useSystemTheme', async () => {
    localStorage.setItem('useSystemTheme', 'true');
    const useThemeStore = await getStore();

    act(() => {
      useThemeStore.getState().toggleTheme();
    });

    expect(useThemeStore.getState().useSystemTheme).toBe(false);
    expect(localStorage.getItem('useSystemTheme')).toBe('false');
  });

  it('setThemeMode should set the exact mode requested', async () => {
    const useThemeStore = await getStore();

    act(() => {
      useThemeStore.getState().setThemeMode('light');
    });

    expect(useThemeStore.getState().themeMode).toBe('light');
    expect(localStorage.getItem('themeMode')).toBe('light');

    act(() => {
      useThemeStore.getState().setThemeMode('dark');
    });

    expect(useThemeStore.getState().themeMode).toBe('dark');
  });

  it('setThemeMode should disable useSystemTheme', async () => {
    const useThemeStore = await getStore();

    act(() => {
      useThemeStore.getState().setUseSystemTheme(true);
    });
    expect(useThemeStore.getState().useSystemTheme).toBe(true);

    act(() => {
      useThemeStore.getState().setThemeMode('light');
    });
    expect(useThemeStore.getState().useSystemTheme).toBe(false);
  });

  it('setUseSystemTheme(true) should enable system theme tracking', async () => {
    const useThemeStore = await getStore();

    act(() => {
      useThemeStore.getState().setUseSystemTheme(true);
    });

    expect(useThemeStore.getState().useSystemTheme).toBe(true);
    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('setUseSystemTheme(false) should disable system theme tracking', async () => {
    const useThemeStore = await getStore();

    act(() => {
      useThemeStore.getState().setUseSystemTheme(true);
    });
    act(() => {
      useThemeStore.getState().setUseSystemTheme(false);
    });

    expect(useThemeStore.getState().useSystemTheme).toBe(false);
  });
});
