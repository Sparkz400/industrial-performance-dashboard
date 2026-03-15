/**
 * Wraps an async route handler to automatically catch errors and forward them to Express error middleware.
 * Express 5 handles async errors natively, but this provides explicit safety for all async routes.
 *
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped handler that catches rejected promises
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
