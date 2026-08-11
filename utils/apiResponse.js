/**
 * Success response formatter
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} Formatted success response
 */
const successResponse = (res, data = null, message = 'Operation successful', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

/**
 * Error response formatter
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {*} errors - Additional error details
 * @returns {Object} Formatted error response
 */
const errorResponse = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message
  };

  if (errors) {
    response.errors = errors;
  }

  if (process.env.NODE_ENV === 'development' && statusCode === 500) {
    console.error(message);
  }

  return res.status(statusCode).json(response);
};

/**
 * Validation error response formatter
 * @param {Object} res - Express response object
 * @param {Array} errors - Validation errors array
 * @returns {Object} Formatted validation error response
 */
const validationError = (res, errors) => {
  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors: errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }))
  });
};

/**
 * Not found response formatter
 * @param {Object} res - Express response object
 * @param {string} resource - Name of the resource not found
 * @returns {Object} Formatted not found response
 */
const notFoundResponse = (res, resource = 'Resource') => {
  return errorResponse(res, `${resource} not found`, 404);
};

/**
 * Unauthorized response formatter
 * @param {Object} res - Express response object
 * @param {string} message - Unauthorized message
 * @returns {Object} Formatted unauthorized response
 */
const unauthorizedResponse = (res, message = 'Unauthorized') => {
  return errorResponse(res, message, 401);
};

/**
 * Forbidden response formatter
 * @param {Object} res - Express response object
 * @param {string} message - Forbidden message
 * @returns {Object} Formatted forbidden response
 */
const forbiddenResponse = (res, message = 'Forbidden') => {
  return errorResponse(res, message, 403);
};

/**
 * Bad request response formatter
 * @param {Object} res - Express response object
 * @param {string} message - Bad request message
 * @param {*} errors - Additional error details
 * @returns {Object} Formatted bad request response
 */
const badRequestResponse = (res, message = 'Bad request', errors = null) => {
  return errorResponse(res, message, 400, errors);
};

module.exports = {
  successResponse,
  errorResponse,
  validationError,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  badRequestResponse
};
