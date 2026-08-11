const rateLimit = require('express-rate-limit');
const { RateLimitHandler } = require('rate-limit-handler');

// In-memory store for rate limiting (use Redis in production)
const rateLimitHandler = new RateLimitHandler({
  // 15 minutes
  windowMs: 15 * 60 * 1000,
  // Limit each IP to 100 requests per windowMs
  max: 100,
  // Return rate limit info in the `RateLimit-*` headers
  standardHeaders: true,
  // Disable the `X-RateLimit-*` headers
  legacyHeaders: false,
  // Skip successful requests (only count failed ones)
  skipSuccessfulRequests: true,
  // Key generator function
  keyGenerator: (req) => {
    return req.ip; // Use IP address as the key
  },
  // Handler when limit is exceeded
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      success: false,
      message: 'Too many requests, please try again later.',
      retryAfter: options.retryAfter
    });
  }
});

// Apply rate limiting to all routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts, please try again later.'
  }
});

// Rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many file uploads, please try again later.'
  }
});

/**
 * Dynamic rate limiting based on user role
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {Object} options.limits - Limits per role
 * @param {number} options.limits.guest - Limit for unauthenticated users
 * @param {number} options.limits.user - Limit for regular users
 * @param {number} options.limits.teacher - Limit for teachers
 * @param {number} options.limits.admin - Limit for admins
 * @returns {Function} Express middleware
 */
const roleBasedRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    limits = {
      guest: 100,
      user: 500,
      teacher: 1000,
      admin: 5000
    }
  } = options;
  
  return (req, res, next) => {
    // Determine the user's role
    const role = req.user?.role || 'guest';
    
    // Set the appropriate limit based on role
    const max = limits[role] || limits.guest;
    
    // Create a rate limiter with the appropriate limit
    const limiter = rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        // Use both IP and user ID as the key if authenticated
        return req.user ? `${req.user.id}:${req.ip}` : req.ip;
      },
      message: {
        success: false,
        message: `Too many requests. Your current rate limit is ${max} requests per ${windowMs / 1000 / 60} minutes.`
      }
    });
    
    // Apply the rate limiter
    limiter(req, res, next);
  };
};

module.exports = {
  rateLimitHandler,
  apiLimiter,
  authLimiter,
  uploadLimiter,
  roleBasedRateLimit
};
