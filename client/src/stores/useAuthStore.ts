import { create } from 'zustand';
import { api } from '../utils/api';
import type { AuthUser, LoginResponse } from '@/types';
export type { AuthUser } from '@/types';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = (await api.endpoints.login(username, password)) as LoginResponse;
      set({ user: result.user, isLoading: false, error: null });
    } catch (err: unknown) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Login failed' });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.endpoints.logout();
    } catch {
      // Even if the server call fails, clear local state
    }
    set({ user: null, error: null });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const result = (await api.endpoints.getMe()) as LoginResponse;
      set({ user: result.user, isLoading: false, isInitialized: true });
    } catch {
      set({ user: null, isLoading: false, isInitialized: true });
    }
  },

  clearError: () => set({ error: null }),
}));
