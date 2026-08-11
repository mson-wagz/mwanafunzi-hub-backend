const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');
const { errorResponse } = require('./apiResponse');

// Load environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 10;

/**
 * Generate a JWT token
 * @param {Object} payload - Data to include in the token
 * @param {string} expiresIn - Token expiration time
 * @returns {string} JWT token
 */
const generateToken = (payload, expiresIn = JWT_EXPIRES_IN) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    logger.error('Token verification failed:', error.message);
    return null;
  }
};

/**
 * Generate access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} Tokens and user data
 */
const generateAuthTokens = (user) => {
  const tokenId = uuidv4();
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || 'user', // Default role is 'user'
    tokenId,
  };

  const accessToken = generateToken(payload, JWT_EXPIRES_IN);
  const refreshToken = generateToken({ ...payload, isRefreshToken: true }, REFRESH_TOKEN_EXPIRES_IN);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    },
  };
};

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compare a password with a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches hash
 */
const comparePasswords = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Authentication middleware
 * @param {Array} roles - Allowed roles (empty array allows all authenticated users)
 * @returns {Function} Express middleware
 */
const auth = (roles = []) => {
  return (req, res, next) => {
    // Get token from header or query parameter
    let token = req.header('Authorization') || req.query.token;

    // Check if no token
    if (!token) {
      return errorResponse(res, 'No token, authorization denied', 401);
    }

    // Remove 'Bearer ' from token if present
    if (token.startsWith('Bearer ')) {
      token = token.substring(7);
    }

    try {
      // Verify token
      const decoded = verifyToken(token);
      
      if (!decoded) {
        return errorResponse(res, 'Token is not valid', 401);
      }

      // Check if token is a refresh token
      if (decoded.isRefreshToken) {
        return errorResponse(res, 'Refresh token cannot be used as access token', 401);
      }

      // Check user role if roles are specified
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return errorResponse(res, 'Not authorized to access this route', 403);
      }

      // Add user from payload
      req.user = decoded;
      next();
    } catch (error) {
      logger.error('Authentication error:', error);
      return errorResponse(res, 'Token is not valid', 401);
    }
  };
};

/**
 * Refresh token middleware
 * @returns {Function} Express middleware
 */
const refreshToken = (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return errorResponse(res, 'Refresh token is required', 400);
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    
    if (!decoded.isRefreshToken) {
      return errorResponse(res, 'Invalid refresh token', 401);
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateAuthTokens({
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    });

    // Send new tokens
    res.json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    return errorResponse(res, 'Invalid refresh token', 401);
  }
};

/**
 * Generate a random password
 * @param {number} length - Length of the password
 * @returns {string} Random password
 */
const generateRandomPassword = (length = 12) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\\:;?><,./-=';
  let password = '';
  
  // Ensure at least one character from each character set
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+~`|}{[]\\:;?><,./-=';
  
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));
  
  // Fill the rest of the password
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Shuffle the password to make it more random
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Generate a password reset token
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @returns {string} Password reset token
 */
const generatePasswordResetToken = (userId, email) => {
  const payload = {
    userId,
    email,
    type: 'password_reset',
    timestamp: Date.now(),
  };
  
  return generateToken(payload, '1h'); // 1 hour expiration
};

/**
 * Verify a password reset token
 * @param {string} token - Password reset token
 * @returns {Object} Decoded token payload or null if invalid
 */
const verifyPasswordResetToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type !== 'password_reset') {
      return null;
    }
    
    return decoded;
  } catch (error) {
    logger.error('Password reset token verification failed:', error.message);
    return null;
  }
};

module.exports = {
  generateToken,
  verifyToken,
  generateAuthTokens,
  hashPassword,
  comparePasswords,
  auth,
  refreshToken,
  generateRandomPassword,
  generatePasswordResetToken,
  verifyPasswordResetToken,
};
