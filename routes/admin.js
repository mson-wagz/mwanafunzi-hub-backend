const express = require('express');
const router = express.Router();
const db = require('../db-connection');
const { authenticate } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

// Middleware stack for all admin routes
router.use(authenticate, adminAuth);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users
 * @access  Private (Admin)
 */
router.get('/users', (req, res) => {
  try {
    const users = db.getAllUsers.all();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Server error while fetching users' });
  }
});

module.exports = router;
