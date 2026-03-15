/**
 * Utility functions for handling CSRF token retrieval, storage, and management
 */

// Constants
export const CSRF_HEADER_NAME = "x-csrf-token"; // Use lowercase standard
const CSRF_TOKEN_KEY = "csrf_token";
const CSRF_TOKEN_TIMESTAMP_KEY = "csrf_token_timestamp";
const TOKEN_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Get the stored CSRF token from localStorage with validation
 * NOTE: This function is intended for the CLIENT-SIDE.
 * @returns The stored CSRF token or null if none exists or expired
 */
export const getStoredCsrfToken = (): string | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const token = localStorage.getItem(CSRF_TOKEN_KEY);
  const timestamp = localStorage.getItem(CSRF_TOKEN_TIMESTAMP_KEY);

  if (!token || !timestamp) {
    return null;
  }

  const now = Date.now();
  const tokenTime = parseInt(timestamp, 10);
  if (isNaN(tokenTime) || now - tokenTime > TOKEN_MAX_AGE) {
    clearCsrfToken();
    return null;
  }

  return token;
};

/**
 * Store a CSRF token in localStorage with timestamp
 * NOTE: This function is intended for the CLIENT-SIDE.
 */
export const storeCsrfToken = (token: string): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (token) {
    localStorage.setItem(CSRF_TOKEN_KEY, token);
    localStorage.setItem(CSRF_TOKEN_TIMESTAMP_KEY, Date.now().toString());
  }
};

/**
 * Clear the stored CSRF token and its timestamp
 * NOTE: This function is intended for the CLIENT-SIDE.
 */
export const clearCsrfToken = (): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(CSRF_TOKEN_KEY);
  localStorage.removeItem(CSRF_TOKEN_TIMESTAMP_KEY);
};

/**
 * Fetch a new CSRF token from the server
 * NOTE: This function is intended for the CLIENT-SIDE.
 */
export const fetchCsrfToken = async (csrfEndpoint: string): Promise<string> => {
  if (typeof fetch === "undefined") {
    throw new Error(
      "fetch is not available in this environment (likely server-side)",
    );
  }
  try {
    const response = await fetch(csrfEndpoint, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch CSRF token: ${response.status}`);
    }

    let data: Record<string, string>;
    try {
      data = await response.json();
    } catch (_error) {
      const headerToken = response.headers.get(CSRF_HEADER_NAME);
      if (headerToken) {
        storeCsrfToken(headerToken);
        return headerToken;
      }
      throw new Error(
        "Failed to parse CSRF token response and no token header found",
      );
    }

    const token = data.csrf_token || data.csrfToken || data.token;

    if (!token) {
      throw new Error("No CSRF token in response");
    }

    storeCsrfToken(token);
    return token;
  } catch (error) {
    console.error("Error fetching CSRF token:", error);
    throw error;
  }
};

/**
 * Get a CSRF token, fetching a new one if necessary
 * NOTE: This function is intended for the CLIENT-SIDE.
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
 */
export const addCsrfHeader = (
  headers: Record<string, string> = {},
  token: string,
): Record<string, string> => {
  if (!token) {
    console.warn("Attempting to add empty CSRF token to headers");
  }

  return {
    ...headers,
    [CSRF_HEADER_NAME]: token,
  };
};

/**
 * Check if a response indicates a CSRF token error
 * NOTE: This function is intended for the CLIENT-SIDE.
 */
export const isCsrfError = async (response: Response): Promise<boolean> => {
  if (typeof Response === "undefined" || !(response instanceof Response)) {
    return false;
  }
  if (response.status === 403 || response.status === 419) {
    try {
      const clonedResponse = response.clone();
      const data = await clonedResponse.json();
      return (
        data.error === "invalid_csrf_token" ||
        data.message?.includes("CSRF") ||
        data.error?.includes("csrf") ||
        data.code === "INVALID_CSRF_TOKEN"
      );
    } catch (_e) {
      try {
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        return (
          text.includes("CSRF") ||
          text.includes("csrf") ||
          text.includes("Invalid CSRF token")
        );
      } catch (_err) {
        return false;
      }
    }
  }
  return false;
};
