import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredCsrfToken, storeCsrfToken, clearCsrfToken, addCsrfHeader } from '../csrf';

describe('CSRF utility functions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('storeCsrfToken', () => {
    it('should store a token and timestamp in localStorage', () => {
      storeCsrfToken('test-token-123');
      expect(localStorage.getItem('csrf_token')).toBe('test-token-123');
      expect(localStorage.getItem('csrf_token_timestamp')).toBeTruthy();
    });

    it('should not store anything if token is empty', () => {
      storeCsrfToken('');
      expect(localStorage.getItem('csrf_token')).toBeNull();
      expect(localStorage.getItem('csrf_token_timestamp')).toBeNull();
    });
  });

  describe('getStoredCsrfToken', () => {
    it('should return the stored token when it is valid and not expired', () => {
      storeCsrfToken('valid-token');
      expect(getStoredCsrfToken()).toBe('valid-token');
    });

    it('should return null when no token is stored', () => {
      expect(getStoredCsrfToken()).toBeNull();
    });

    it('should return null when token exists but timestamp is missing', () => {
      localStorage.setItem('csrf_token', 'orphan-token');
      expect(getStoredCsrfToken()).toBeNull();
    });

    it('should return null and clear storage when token is expired', () => {
      localStorage.setItem('csrf_token', 'expired-token');
      // Set timestamp to 2 hours ago (TOKEN_MAX_AGE is 1 hour)
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      localStorage.setItem('csrf_token_timestamp', twoHoursAgo.toString());

      expect(getStoredCsrfToken()).toBeNull();
      // Token should have been cleared
      expect(localStorage.getItem('csrf_token')).toBeNull();
      expect(localStorage.getItem('csrf_token_timestamp')).toBeNull();
    });

    it('should return null when timestamp is not a valid number', () => {
      localStorage.setItem('csrf_token', 'some-token');
      localStorage.setItem('csrf_token_timestamp', 'not-a-number');

      expect(getStoredCsrfToken()).toBeNull();
    });

    it('should return token when it is just under the max age', () => {
      localStorage.setItem('csrf_token', 'almost-expired');
      // Set timestamp to 59 minutes ago
      const fiftyNineMinAgo = Date.now() - 59 * 60 * 1000;
      localStorage.setItem('csrf_token_timestamp', fiftyNineMinAgo.toString());

      expect(getStoredCsrfToken()).toBe('almost-expired');
    });
  });

  describe('clearCsrfToken', () => {
    it('should remove both token and timestamp from localStorage', () => {
      storeCsrfToken('to-be-cleared');
      expect(localStorage.getItem('csrf_token')).toBeTruthy();

      clearCsrfToken();
      expect(localStorage.getItem('csrf_token')).toBeNull();
      expect(localStorage.getItem('csrf_token_timestamp')).toBeNull();
    });

    it('should not throw when there is nothing to clear', () => {
      expect(() => clearCsrfToken()).not.toThrow();
    });
  });

  describe('addCsrfHeader', () => {
    it('should add the x-csrf-token header to an empty headers object', () => {
      const result = addCsrfHeader({}, 'my-token');
      expect(result).toEqual({
        'x-csrf-token': 'my-token',
      });
    });

    it('should preserve existing headers', () => {
      const result = addCsrfHeader(
        { 'Content-Type': 'application/json', Authorization: 'Bearer xyz' },
        'csrf-val',
      );
      expect(result).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer xyz',
        'x-csrf-token': 'csrf-val',
      });
    });

    it('should add empty string token with a console warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = addCsrfHeader({}, '');
      expect(result['x-csrf-token']).toBe('');
      expect(warnSpy).toHaveBeenCalledWith('Attempting to add empty CSRF token to headers');
    });
  });
});
