import { beforeEach, describe, expect, it, vi } from 'vitest';
const endpoints = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), getMe: vi.fn() }));
vi.mock('../../utils/api', () => ({ api: { endpoints } }));
import { useAuthStore } from '../useAuthStore';
const user = { id: 7, username: 'owned', role: 'operator' };
describe('offline logout intent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    useAuthStore.setState({ user: null, isInitialized: false, isLoading: false, error: null });
  });
  it('never restores a session while failed logout is pending, then clears it on confirmed cleanup', async () => {
    endpoints.logout.mockRejectedValue(new Error('offline'));
    await useAuthStore.getState().logout();
    expect(localStorage.getItem('pd-pending-logout-v1')).toBe('true');
    await useAuthStore.getState().checkAuth();
    expect(endpoints.getMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    endpoints.logout.mockResolvedValue({});
    await useAuthStore.getState().checkAuth();
    expect(localStorage.getItem('pd-pending-logout-v1')).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
  it('permits explicit sign-in after failed logout', async () => {
    endpoints.logout.mockRejectedValue(new Error('offline'));
    await useAuthStore.getState().logout();
    endpoints.login.mockResolvedValue({ user });
    await useAuthStore.getState().login('owned', 'fixture');
    expect(useAuthStore.getState().user?.id).toBe(7);
    expect(localStorage.getItem('pd-pending-logout-v1')).toBeNull();
  });
  it('ignores a late authentication result after explicit logout', async () => {
    let resolve!: (value: unknown) => void;
    endpoints.getMe.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const checking = useAuthStore.getState().checkAuth();
    endpoints.logout.mockResolvedValue({});
    await useAuthStore.getState().logout();
    resolve({ user });
    await checking;
    expect(useAuthStore.getState().user).toBeNull();
  });
  it('honors another tab logout on any screen without cancelling a newer explicit sign-in', async () => {
    endpoints.login.mockResolvedValue({ user });
    await useAuthStore.getState().login('owned', 'fixture');
    localStorage.setItem('pd-operator-drafts-v1', 'protected fixture');
    localStorage.setItem('pd-pending-logout-v1', 'true');
    const event = () =>
      new StorageEvent('storage', { key: 'pd-pending-logout-v1', newValue: 'true' });
    window.dispatchEvent(event());
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem('pd-operator-drafts-v1')).toBeNull();
    expect(endpoints.logout).not.toHaveBeenCalled();
    await useAuthStore.getState().login('owned', 'fixture');
    window.dispatchEvent(event());
    expect(useAuthStore.getState().user?.id).toBe(7);
  });
});
