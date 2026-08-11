const rateLimit = require('express-rate-limit');
const { logger } = require('./logger');

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 100; // Limit each IP to 100 requests per windowMs
const MAX_AUTH_REQUESTS = 5; // Stricter limit for auth endpoints
const MAX_PASSWORD_RESET_REQUESTS = 3; // Very strict limit for password resets

/**
 * Create a rate limiter instance
 * @param {Object} options - Rate limiter options
 * @returns {Object} Rate limiter middleware
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = RATE_LIMIT_WINDOW_MS,
    max = MAX_REQUESTS_PER_WINDOW,
    message = 'Too many requests, please try again later.',
    keyGenerator = (req) => {
      // Use IP + user ID for authenticated users, just IP for anonymous
      return req.user ? `${req.user.id}-${req.ip}` : req.ip;
    },
    skip = (req) => {
      // Skip rate limiting for certain paths or in development
      const skipPaths = ['/health', '/api-docs', '/favicon.ico'];
      return process.env.NODE_ENV === 'development' || skipPaths.includes(req.path);
    },
    ...rest
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    keyGenerator,
    skip,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded:', {
        ip: req.ip,
        method: req.method,
        path: req.path,
        userId: req.user?.id,
      });
      
      res.status(429).json({ 
        success: false, 
        message: message,
        retryAfter: Math.ceil(windowMs / 1000) // Convert to seconds
      });
    },
    ...rest,
  });
};

// Global rate limiter for all requests
const globalLimiter = createRateLimiter({
  max: MAX_REQUESTS_PER_WINDOW,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

// Stricter rate limiter for authentication endpoints
const authLimiter = createRateLimiter({
  max: MAX_AUTH_REQUESTS,
  message: 'Too many login attempts, please try again after 15 minutes',
  skip: (req) => {
    // Only apply to auth endpoints
    const authPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh-token'];
    return !authPaths.some(path => req.path.startsWith(path));
  },
});

// Very strict rate limiter for password reset endpoints
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: MAX_PASSWORD_RESET_REQUESTS,
  message: 'Too many password reset attempts, please try again in an hour',
  skip: (req) => !req.path.startsWith('/api/auth/forgot-password'),
});

// Rate limiter for API endpoints
const apiLimiter = createRateLimiter({
  max: MAX_REQUESTS_PER_WINDOW * 2, // Slightly higher limit for API
  message: 'Too many API requests, please try again later',
  skip: (req) => !req.path.startsWith('/api/'),
});

// Rate limiter for file uploads
const fileUploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit to 10 uploads per hour
  message: 'Too many file uploads, please try again later',
  skip: (req) => !req.path.startsWith('/api/upload'),
});

// Rate limiter for public endpoints
const publicLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Higher limit for public endpoints
  message: 'Too many requests, please try again later',
  skip: (req) => !req.path.startsWith('/public/'),
});

// Rate limiter for admin endpoints
const adminLimiter = createRateLimiter({
  max: 500, // Higher limit for admin endpoints
  message: 'Too many admin requests, please try again later',
  keyGenerator: (req) => {
    // Only apply to admin users
    if (req.user && req.user.role === 'admin') {
      return `admin-${req.user.id}-${req.ip}`;
    }
    return `non-admin-${req.ip}`;
  },
  skip: (req) => !req.path.startsWith('/api/admin/'),
});

/**
 * Middleware to apply rate limiting based on the request path
 * @returns {Function} Express middleware
 */
const rateLimiter = () => {
  return (req, res, next) => {
    // Apply the most specific rate limiter first
    if (req.path.startsWith('/api/auth/forgot-password')) {
      return passwordResetLimiter(req, res, next);
    }
    
    if (req.path.startsWith('/api/auth/')) {
      return authLimiter(req, res, next);
    }
    
    if (req.path.startsWith('/api/upload')) {
      return fileUploadLimiter(req, res, next);
    }
    
    if (req.path.startsWith('/api/admin/')) {
      return adminLimiter(req, res, next);
    }
    
    if (req.path.startsWith('/api/')) {
      return apiLimiter(req, res, next);
    }
    
    if (req.path.startsWith('/public/')) {
      return publicLimiter(req, res, next);
    }
    
    // Apply global limiter to all other requests
    return globalLimiter(req, res, next);
  };
};

module.exports = {
  createRateLimiter,
  rateLimiter,
  globalLimiter,
  authLimiter,
  passwordResetLimiter,
  apiLimiter,
  fileUploadLimiter,
  publicLimiter,
  adminLimiter,
};
