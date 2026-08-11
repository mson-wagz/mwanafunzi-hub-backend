const { validationResult } = require('express-validator');
const { body } = require('express-validator');

/**
 * Validation middleware
 * Checks for validation errors and sends appropriate response
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Common validation rules
const commonRules = {
  email: body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
    
  password: body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
    
  username: body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage('Username can only contain letters, numbers, dots, underscores, and hyphens'),
    
  title: body('title')
    .trim()
    .isLength({ min: 10, max: 200 })
    .withMessage('Title must be between 10 and 200 characters'),
    
  description: body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
    
  content: body('content')
    .trim()
    .isLength({ min: 20 })
    .withMessage('Content must be at least 20 characters long'),
    
  topicIds: body('topic_ids')
    .optional()
    .isArray()
    .withMessage('Topic IDs must be an array'),
    
  topicId: body('topic_id')
    .isInt({ min: 1 })
    .withMessage('Invalid topic ID'),
    
  vote: body('vote')
    .isIn(['up', 'down'])
    .withMessage('Vote must be either "up" or "down"')
};

// Validation schemas
const authValidation = {
  register: [
    commonRules.username,
    commonRules.email,
    commonRules.password,
    body('full_name')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Full name cannot exceed 100 characters'),
    body('bio')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Bio cannot exceed 500 characters'),
    body('role')
      .optional()
      .isIn(['student', 'teacher'])
      .withMessage('Invalid role')
  ],
  
  login: [
    commonRules.email,
    body('password').exists().withMessage('Password is required')
  ],
  
  updateProfile: [
    commonRules.username.optional(),
    commonRules.email.optional(),
    body('full_name')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Full name cannot exceed 100 characters'),
    body('bio')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Bio cannot exceed 500 characters'),
    body('current_password')
      .if(body('new_password').exists())
      .notEmpty()
      .withMessage('Current password is required to change password'),
    body('new_password')
      .optional()
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
  ],
  
  question: {
    create: [
      commonRules.title,
      commonRules.content,
      commonRules.topicIds
    ],
    update: [
      commonRules.title.optional(),
      commonRules.content.optional(),
      commonRules.topicIds.optional()
    ]
  },
  
  answer: {
    create: [
      commonRules.content,
      body('question_id')
        .isInt({ min: 1 })
        .withMessage('Invalid question ID')
    ],
    update: [
      commonRules.content
    ]
  },
  
  resource: {
    create: [
      commonRules.title,
      commonRules.description.optional(),
      commonRules.topicIds.optional()
    ],
    update: [
      commonRules.title.optional(),
      commonRules.description.optional(),
      commonRules.topicIds.optional()
    ]
  },
  
  vote: [
    commonRules.vote
  ]
};

module.exports = {
  validate,
  commonRules,
  authValidation
};
