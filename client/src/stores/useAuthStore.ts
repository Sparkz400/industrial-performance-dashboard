import { create } from 'zustand';
import { api } from '../utils/api';
import type { AuthUser, LoginResponse } from '@/types';
import { clearOfflineDrafts, readOfflineDrafts } from '@/features/production/offlineDrafts';
export type { AuthUser } from '@/types';
const PENDING_LOGOUT_KEY = 'pd-pending-logout-v1';
let authGeneration = 0;

/** Read only the explicit logout intent; this marker contains no account material. */
function hasPendingLogout() {
  try {
    return localStorage.getItem(PENDING_LOGOUT_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Preserve a failed logout across reload until the server confirms it.
 * @param pending Whether server logout remains pending.
 */
function markPendingLogout(pending: boolean) {
  try {
    if (pending) localStorage.setItem(PENDING_LOGOUT_KEY, 'true');
    else localStorage.removeItem(PENDING_LOGOUT_KEY);
  } catch {
    /* Disabled storage cannot retain a logout marker. */
  }
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearLocalSession: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  login: async (username: string, password: string) => {
    const generation = ++authGeneration;
    set({ isLoading: true, error: null });
    try {
      const result = (await api.endpoints.login(username, password)) as LoginResponse;
      if (generation !== authGeneration) return;
      markPendingLogout(false);
      if (
        !['admin', 'supervisor', 'operator'].includes(result.user.role) ||
        result.user.recoveryMode
      )
        clearOfflineDrafts();
      else readOfflineDrafts(result.user.id);
      set({ user: result.user, isLoading: false, error: null });
    } catch (err: unknown) {
      if (generation !== authGeneration) return;
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Login failed' });
      throw err;
    }
  },

  logout: async () => {
    const generation = ++authGeneration;
    markPendingLogout(true);
    clearOfflineDrafts();
    set({ user: null, error: null, isLoading: false });
    try {
      await api.endpoints.logout();
      if (generation === authGeneration) markPendingLogout(false);
    } catch {
      // Even if the server call fails, clear local state
    }
    if (generation === authGeneration) set({ user: null, error: null });
  },

  checkAuth: async () => {
    const generation = authGeneration;
    set({ isLoading: true });
    try {
      if (hasPendingLogout()) {
        clearOfflineDrafts();
        set({ user: null, isInitialized: true });
        await api.endpoints.logout();
        if (generation === authGeneration) {
          markPendingLogout(false);
          set({ user: null, isLoading: false, isInitialized: true });
        }
        return;
      }
      const result = (await api.endpoints.getMe()) as LoginResponse;
      if (generation !== authGeneration || hasPendingLogout()) return;
      if (
        !['admin', 'supervisor', 'operator'].includes(result.user.role) ||
        result.user.recoveryMode
      )
        clearOfflineDrafts();
      else readOfflineDrafts(result.user.id);
      set({ user: result.user, isLoading: false, isInitialized: true });
    } catch (error) {
      if (generation !== authGeneration) return;
      if ([401, 403].includes((error as { status?: number })?.status ?? 0)) clearOfflineDrafts();
      set({ user: null, isLoading: false, isInitialized: true });
    }
  },

  clearError: () => set({ error: null }),
  clearLocalSession: () => {
    authGeneration++;
    set({ user: null, error: null, isLoading: false });
  },
}));

const retryPendingLogout = () => {
  if (hasPendingLogout() && !useAuthStore.getState().isLoading)
    void useAuthStore.getState().checkAuth();
};
window.addEventListener('online', retryPendingLogout);
const receiveLogout = (event: StorageEvent) => {
  if (
    event.key === null ||
    (event.key === PENDING_LOGOUT_KEY && event.newValue === 'true' && hasPendingLogout())
  ) {
    useAuthStore.getState().clearLocalSession();
    clearOfflineDrafts();
  }
};
window.addEventListener('storage', receiveLogout);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    window.removeEventListener('online', retryPendingLogout);
    window.removeEventListener('storage', receiveLogout);
  });
