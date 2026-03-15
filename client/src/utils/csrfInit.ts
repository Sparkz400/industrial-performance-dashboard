/**
 * @deprecated Use CsrfProvider from './csrfContext' instead.
 * This file is kept for backward compatibility but delegates to the centralized CSRF context.
 */
import { fetchCsrfToken } from './csrf';
import { API_ENDPOINTS } from '../config/config';

/**
 * Force refresh the CSRF token.
 * This is the only function still needed by protectedFetch.
 */
export const forceRefreshToken = async (): Promise<string> =>
  fetchCsrfToken(API_ENDPOINTS.csrfToken);

export default forceRefreshToken;
