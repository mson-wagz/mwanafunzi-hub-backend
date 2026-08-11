const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db-connection');
const { getUserByEmail, createUser, getUserById } = db;
const { authenticate } = require('../middleware/auth');

// Login route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user by username
    const user = db.getUserByUsername.get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.user_id, role: user.role },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '24h' }
    );

    // Return user data (without password)
    const { password_hash, ...userData } = user;
    res.json({ 
      token, 
      user: {
        id: user.user_id,
        username: user.full_name,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        created_at: user.created_at
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Register route
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role = 'student' } = req.body;
    
    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check if user exists
    const existingUser = db.getUserByEmail.get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Debug: Log the prepared statement SQL
    console.log('Create user SQL:', db.createUser.toString());
    
    // Create user
    let result;
    try {
      result = db.createUser.run(username, email, passwordHash, username, role);
      console.log('Insert result:', result);
      
      if (!result.lastInsertRowid) {
        throw new Error('Failed to create user: No lastInsertRowid returned');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }

    // Generate token
    const token = jwt.sign(
      { userId: result.lastInsertRowid, role },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: { 
        id: result.lastInsertRowid, 
        username, 
        email, 
        role,
        full_name: username,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Get current user
router.get('/me', (req, res) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    
    // Get user from database using prepared statement
    const user = db.getUserById.get(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired token' 
      });
    }
    
    // Return user data without sensitive information
    const { password_hash, ...userData } = user;
    res.json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Error in /me endpoint:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Session expired, please login again' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

module.exports = router;
