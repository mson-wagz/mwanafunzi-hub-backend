const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { stmts } = require('../db-connection');
const { errorResponse } = require('./apiResponse');

/**
 * Generate JWT token
 * @param {Object} payload - Data to include in the token
 * @param {string} expiresIn - Token expiration time (e.g., '1h', '7d')
 * @returns {string} JWT token
 */
const generateToken = (payload, expiresIn = '24h') => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches hash
 */
const comparePasswords = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate a random password
 * @param {number} length - Length of the password (default: 12)
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
 * @param {number} userId - User ID
 * @returns {string} Reset token
 */
const generatePasswordResetToken = (userId) => {
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour
  
  // Store the token in the database
  stmts.createPasswordResetToken.run(
    userId,
    token,
    expiresAt.toISOString()
  );
  
  return token;
};

/**
 * Verify password reset token
 * @param {string} token - Reset token
 * @returns {Object} Token info if valid, null otherwise
 */
const verifyPasswordResetToken = (token) => {
  try {
    const tokenInfo = stmts.getPasswordResetToken.get(token);
    
    if (!tokenInfo || new Date(tokenInfo.expires_at) < new Date()) {
      // Token is invalid or expired
      if (tokenInfo) {
        // Delete expired token
        stmts.deletePasswordResetToken.run(token);
      }
      return null;
    }
    
    return tokenInfo;
  } catch (error) {
    console.error('Error verifying password reset token:', error);
    return null;
  }
};

/**
 * Middleware to check if user is authenticated
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const isAuthenticated = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Authentication required', 401);
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 'Token has expired', 401);
    }
    return errorResponse(res, 'Invalid token', 401);
  }
};

/**
 * Middleware to check if user has required role(s)
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware
 */
const hasRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'Authentication required', 401);
    }
    
    if (!roles.includes(req.user.role)) {
      return errorResponse(res, 'Insufficient permissions', 403);
    }
    
    next();
  };
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePasswords,
  generateRandomPassword,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  isAuthenticated,
  hasRole
};
