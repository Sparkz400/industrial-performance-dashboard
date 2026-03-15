/**
 * Standardized API response helpers.
 *
 * Every JSON response from the server should use one of these functions
 * so that clients always receive a consistent envelope.
 */

export const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
};

export const error = (res, message, statusCode = 500, details = null) => {
  return res.status(statusCode).json({
    success: false,
    error: { message, ...(details && { details }) },
    timestamp: new Date().toISOString(),
  });
};

export const paginated = (res, data, total, limit, offset) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
    timestamp: new Date().toISOString(),
  });
};
