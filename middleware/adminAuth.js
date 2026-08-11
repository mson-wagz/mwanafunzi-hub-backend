const jwt = require('jsonwebtoken');

const adminAuth = (req, res, next) => {
  // The existing 'authenticate' middleware should have already attached the user to the request
  const user = req.user;

  if (user && user.role === 'admin') {
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: Access is restricted to administrators.' });
};

module.exports = { adminAuth };
