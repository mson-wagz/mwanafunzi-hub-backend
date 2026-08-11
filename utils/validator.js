const { body, param, query, validationResult } = require('express-validator');
const { errorResponse } = require('./apiResponse');
const { logger } = require('./logger');

/**
 * Validation error formatter
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const formattedErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value,
      location: err.location,
    }));

    logger.warn('Validation failed:', { errors: formattedErrors });
    return errorResponse(res, 'Validation failed', 400, { errors: formattedErrors });
  };
};

// Common validation rules
const commonRules = {
  // ID validation (MongoDB ObjectId or integer)
  id: param('id')
    .trim()
    .notEmpty()
    .withMessage('ID is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('ID must be between 1 and 50 characters'),

  // Email validation
  email: body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  // Password validation
  password: body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain at least one special character'),

  // Username validation
  username: body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage('Username can only contain letters, numbers, dots, underscores, and hyphens'),

  // Name validation
  name: body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  // Title validation
  title: body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('Title must be between 3 and 200 characters'),

  // Description validation
  description: body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),

  // Content validation
  content: body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 10 })
    .withMessage('Content must be at least 10 characters long'),

  // Status validation
  status: body('status')
    .optional()
    .isIn(['active', 'inactive', 'pending', 'published', 'draft', 'archived'])
    .withMessage('Invalid status value'),

  // Pagination validation
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    query('sort')
      .optional()
      .trim()
      .matches(/^[a-zA-Z0-9_,.\s-]+$/)
      .withMessage('Invalid sort parameter'),
  ],

  // Search query validation
  searchQuery: query('q')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters'),
};

// Authentication validation rules
const authValidation = {
  register: [
    commonRules.name,
    commonRules.email,
    commonRules.password,
    body('confirmPassword')
      .trim()
      .notEmpty()
      .withMessage('Please confirm your password')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match'),
  ],

  login: [
    commonRules.email,
    body('password')
      .trim()
      .notEmpty()
      .withMessage('Password is required'),
  ],

  forgotPassword: [
    commonRules.email,
  ],

  resetPassword: [
    commonRules.password,
    body('token')
      .trim()
      .notEmpty()
      .withMessage('Reset token is required'),
  ],
};

// User validation rules
const userValidation = {
  create: [
    commonRules.name,
    commonRules.email,
    commonRules.username,
    body('role')
      .optional()
      .isIn(['user', 'admin', 'moderator'])
      .withMessage('Invalid role'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'suspended'])
      .withMessage('Invalid status'),
  ],

  update: [
    commonRules.name.optional(),
    commonRules.email.optional(),
    commonRules.username.optional(),
    body('bio')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Bio cannot exceed 500 characters'),
  ],
};

// Resource validation rules
const resourceValidation = {
  create: [
    commonRules.title,
    commonRules.description,
    body('file')
      .custom((value, { req }) => {
        if (!req.file) {
          throw new Error('File is required');
        }
        return true;
      })
      .withMessage('Please upload a file'),
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
    body('tags.*')
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Each tag must be between 1 and 50 characters'),
  ],

  update: [
    commonRules.title.optional(),
    commonRules.description.optional(),
    body('status')
      .optional()
      .isIn(['draft', 'published', 'archived'])
      .withMessage('Invalid status'),
  ],
};

// Comment validation rules
const commentValidation = {
  create: [
    body('content')
      .trim()
      .notEmpty()
      .withMessage('Comment content is required')
      .isLength({ min: 2, max: 1000 })
      .withMessage('Comment must be between 2 and 1000 characters'),
    body('resourceId')
      .trim()
      .notEmpty()
      .withMessage('Resource ID is required'),
  ],
};

// Sanitization middleware
const sanitize = {
  // Sanitize request body
  body: (req, res, next) => {
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          req.body[key] = req.body[key].trim();
        }
      });
    }
    next();
  },

  // Sanitize query parameters
  query: (req, res, next) => {
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = req.query[key].trim();
        }
      });
    }
    next();
  },

  // Sanitize URL parameters
  params: (req, res, next) => {
    if (req.params) {
      Object.keys(req.params).forEach(key => {
        if (typeof req.params[key] === 'string') {
          req.params[key] = req.params[key].trim();
        }
      });
    }
    next();
  },
};

module.exports = {
  validate,
  commonRules,
  authValidation,
  userValidation,
  resourceValidation,
  commentValidation,
  sanitize,
};
