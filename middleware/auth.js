const jwt = require('jsonwebtoken');
const { getUserById } = require('../db-connection');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request object
 */
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');

    const user = getUserById.get(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    req.user = user; // attach DB user object
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired, please login again'
      });
    }
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }

    next();
  };
};

/**
 * Allow self (matching :id param) or admin
 * Use for user-specific routes like /api/users/:id
 */
const allowSelfOrAdmin = (idParam = 'id') => {
  return (req, res, next) => {
    const requestedId = parseInt(req.params[idParam], 10);

    if (req.user.role !== 'admin' && req.user.user_id !== requestedId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

/**
 * Ownership check for resources
 */
const checkOwnership = (resourceType, idParam = 'id') => {
  return (req, res, next) => {
    const resourceId = req.params[idParam];
    const userId = req.user.user_id; // fix: user_id not id

    let query = '';
    let params = [resourceId];

    switch (resourceType.toLowerCase()) {
      case 'question':
        query = 'SELECT user_id FROM questions WHERE id = ?';
        break;
      case 'answer':
        query = 'SELECT user_id FROM answers WHERE id = ?';
        break;
      case 'resource':
        query = 'SELECT uploaded_by as user_id FROM resources WHERE id = ?';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid resource type'
        });
    }

    db.get(query, params, (err, resource) => {
      if (err) {
        console.error('Ownership check error:', err);
        return res.status(500).json({
          success: false,
          message: 'Error verifying resource ownership'
        });
      }

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }

      if (resource.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to modify this resource'
        });
      }

      req[resourceType] = resource;
      next();
    });
  };
};

module.exports = {
  authenticate,
  authorize,
  allowSelfOrAdmin,
  checkOwnership
};
