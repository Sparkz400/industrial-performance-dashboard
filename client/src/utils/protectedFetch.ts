import { API_ENDPOINTS } from '../config/config';
import { addCsrfHeader, clearCsrfToken, getCsrfToken, isCsrfError } from './csrf';

let refreshingTokenPromise: Promise<string> | null = null;

/**
 * Singleton token refresh — ensures only one refresh happens at a time.
 */
const refreshTokenSingleton = async (): Promise<string> => {
  if (!refreshingTokenPromise) {
    refreshingTokenPromise = (async () => {
      try {
        clearCsrfToken();
        return await getCsrfToken(API_ENDPOINTS.csrfToken, true);
      } finally {
        refreshingTokenPromise = null;
      }
    })();
  }
  return refreshingTokenPromise;
};

/**
 * Fetch wrapper that automatically includes CSRF tokens for state-changing requests
 * and retries once on CSRF token errors.
 * @param url
 * @param options
 * @param isRetry
 */
export const protectedFetch = async (
  url: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<Response> => {
  options.method = options.method || 'GET';
  options.credentials = 'include';

  // Inject plant context header
  const plantId = (window as unknown as Record<string, unknown>).__currentPlantId;
  if (plantId) {
    const headers = (options.headers || {}) as Record<string, string>;
    headers['X-Plant-Id'] = String(plantId);
    options.headers = headers;
  }

  const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method);

  // Attach CSRF token for state-changing requests
  if (isStateChanging) {
    try {
      const token = await getCsrfToken(API_ENDPOINTS.csrfToken, false);
      options.headers = addCsrfHeader((options.headers || {}) as Record<string, string>, token);
    } catch {
      // Proceed without token — server will reject if required
    }
  }

  const response = await fetch(url, options);

  // On 401, dispatch auth error event so the app can redirect to login
  if (response.status === 401 && !url.includes('/auth/')) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  // On CSRF error, refresh token and retry once
  if (!response.ok && (await isCsrfError(response)) && !isRetry) {
    try {
      const newToken = await refreshTokenSingleton();
      options.headers = addCsrfHeader((options.headers || {}) as Record<string, string>, newToken);
      return protectedFetch(url, options, true);
    } catch {
      window.dispatchEvent(new CustomEvent('csrf:error'));
      return response;
    }
  }

  return response;
};

export default protectedFetch;
