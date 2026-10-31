/**
 * Utility functions for handling CSRF token retrieval, storage, and management
 */

// Constants
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_TOKEN_TIMESTAMP_KEY = 'csrf_token_timestamp';
const TOKEN_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Get the stored CSRF token from localStorage with validation
 */
export const getStoredCsrfToken = (): string | null => {
  const token = localStorage.getItem(CSRF_TOKEN_KEY);
  const timestamp = localStorage.getItem(CSRF_TOKEN_TIMESTAMP_KEY);

  // If no token or timestamp, return null
  if (!token || !timestamp) {
    return null;
  }

  // Check if the token is expired
  const now = Date.now();
  const tokenTime = parseInt(timestamp, 10);
  if (isNaN(tokenTime) || now - tokenTime > TOKEN_MAX_AGE) {
    // Token is expired, clear it
    clearCsrfToken();
    return null;
  }

  return token;
};

/**
 * Store a CSRF token in localStorage with timestamp
 * @param token
 */
export const storeCsrfToken = (token: string): void => {
  if (token) {
    localStorage.setItem(CSRF_TOKEN_KEY, token);
    localStorage.setItem(CSRF_TOKEN_TIMESTAMP_KEY, Date.now().toString());
  }
};

/**
 * Clear the stored CSRF token and its timestamp
 */
export const clearCsrfToken = (): void => {
  localStorage.removeItem(CSRF_TOKEN_KEY);
  localStorage.removeItem(CSRF_TOKEN_TIMESTAMP_KEY);
};

/**
 * Fetch a new CSRF token from the server
 * @param csrfEndpoint
 */
export const fetchCsrfToken = async (csrfEndpoint: string): Promise<string> => {
  try {
    const response = await fetch(csrfEndpoint, {
      method: 'GET',
      credentials: 'include', // Important: include cookies
      cache: 'no-store', // Prevent caching
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch CSRF token: ${response.status}`);
    }

    let data: Record<string, string>;
    try {
      // Try to parse as JSON
      data = await response.json();
    } catch {
      // Parser errors can contain response text; expose only the sanitized failure below.
      const headerToken = response.headers.get(CSRF_HEADER_NAME);
      if (headerToken) {
        storeCsrfToken(headerToken);
        return headerToken;
      }
      throw new Error('Failed to parse CSRF token response and no token header found');
    }

    // Look for token in the response body
    const token = data.csrf_token || data.csrfToken || data.token;

    if (!token) {
      throw new Error('No CSRF token in response');
    }

    // Store the token
    storeCsrfToken(token);
    return token;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    throw error;
  }
};

/**
 * Get a CSRF token, fetching a new one if necessary
 * @param csrfEndpoint
 * @param forceRefresh
 */
export const getCsrfToken = async (
  csrfEndpoint: string,
  forceRefresh: boolean = false,
): Promise<string> => {
  if (!forceRefresh) {
    const storedToken = getStoredCsrfToken();
    if (storedToken) {
      return storedToken;
    }
  }

  return fetchCsrfToken(csrfEndpoint);
};

/**
 * Add a CSRF token to request headers
 * @param headers
 * @param token
 */
export const addCsrfHeader = (
  headers: Record<string, string> = {},
  token: string,
): Record<string, string> => {
  if (!token) {
    console.warn('Attempting to add empty CSRF token to headers');
  }

  return {
    ...headers,
    [CSRF_HEADER_NAME]: token,
  };
};

/**
 * Check if a response indicates a CSRF token error
 * @param response
 */
export const isCsrfError = async (response: Response): Promise<boolean> => {
  // Status codes that might indicate CSRF issues
  if (response.status === 403 || response.status === 419) {
    try {
      const data = await response.clone().json();
      const errorLower = (data.error || '').toLowerCase();
      return (
        data.code === 'INVALID_CSRF_TOKEN' ||
        errorLower === 'invalid_csrf_token' ||
        errorLower.includes('csrf') ||
        data.message?.toLowerCase().includes('csrf')
      );
    } catch (_e) {
      // Not a JSON response, check response text
      try {
        const text = await response.clone().text();
        return text.includes('CSRF') || text.includes('csrf');
      } catch (err) {
        console.warn('CSRF error check: unable to read response body', err);
        return false;
      }
    }
  }
  return false;
};
