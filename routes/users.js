const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const stmts = require('../db-connection');
const { authenticate: authenticateToken, allowSelfOrAdmin } = require('../middleware/auth');

const router = express.Router();

// Register a new user
router.post(
  '/register',
  [
    body('username').isLength({ min: 3 }),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('role').optional().isIn(['student', 'teacher']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, full_name, bio, role = 'student' } = req.body;

    try {
      // Check if user already exists
      const existingUser = stmts.getUserByEmail.get(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const result = stmts.createUser.run(
        username,
        email,
        hashedPassword,
        full_name || null,
        bio || null,
        role
      );

      const user = stmts.getUserById.get(result.lastInsertRowid);
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.user_id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '24h' }
      );

      res.status(201).json({
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
          full_name: user.full_name,
          bio: user.bio
        },
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Failed to register user' });
    }
  }
);

// User login
router.post(
  '/login',
  [
    body('email').isEmail(),
    body('password').exists(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const user = stmts.getUserByEmail.get(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.user_id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '24h' }
      );

      res.json({
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
          full_name: user.full_name,
          bio: user.bio
        },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Get current user profile
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = stmts.getUserById.get(req.user.user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove sensitive data
    const { password_hash, ...userData } = user;
    res.json(userData);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/me', authenticateToken, async (req, res) => {
  const { full_name, bio, currentPassword, newPassword } = req.body;
  
  try {
    const user = stmts.getUserById.get(req.user.user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If changing password, verify current password
    if (currentPassword && newPassword) {
      const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!validPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      stmts.updateUserPassword.run(hashedPassword, user.user_id);
    }

    // Update profile
    stmts.updateUserProfile.run(
      full_name || user.full_name,
      bio !== undefined ? bio : user.bio,
      user.user_id
    );

    const updatedUser = stmts.getUserById.get(user.user_id);
    const { password_hash, ...userData } = updatedUser;
    
    res.json(userData);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get all users (admin only)
// Get user profile by ID
router.get('/:id', authenticateToken, allowSelfOrAdmin(), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const user = stmts.getUserById.get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password_hash, ...publicUser } = user;
    return res.json(publicUser);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/:id', authenticateToken, allowSelfOrAdmin(), [
  body('username').optional().isLength({ min: 3 }),
  body('email').optional().isEmail(),
  body('currentPassword').optional().isLength({ min: 6 }),
  body('newPassword').optional().isLength({ min: 6 }),
], async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { username, email, currentPassword, newPassword, bio } = req.body;
    
    // Get current user data
    const user = stmts.getUserById.get(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update fields if provided
    const updates = [];
    const params = [];
    
    if (username && username !== user.username) {
      // Check if username is taken
      const existingUser = stmts.getUserByUsernameExcludingId.get(username, userId);
      
      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      
      updates.push('username = ?');
      params.push(username);
    }
    
    if (email && email !== user.email) {
      // Check if email is taken
      const existingEmail = stmts.getUserByEmailExcludingId.get(email, userId);
      
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      
      updates.push('email = ?');
      params.push(email);
    }
    
    // Handle password change
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      stmts.updateUserPassword.run(hashedPassword, userId);
    }
    
    // Only update if there are changes
    if (updates.length > 0) {
      if (updates.includes('username = ?')) {
        const newUsername = params[updates.indexOf('username = ?')];
        stmts.updateUsername.run(newUsername, userId);
      }
      if (updates.includes('email = ?')) {
        const newEmail = params[updates.indexOf('email = ?')];
        stmts.updateEmail.run(newEmail, userId);
      }
    }
    
    // Return updated user data
    const updatedUser = stmts.getUserById.get(userId);
    
    res.json(updatedUser);
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Set user's personalization topics
router.post('/:id/topics', authenticateToken, allowSelfOrAdmin(), [
  body('topicIds').isArray().withMessage('topicIds must be an array'),
  body('topicIds.*').isInt().withMessage('Each topic ID must be an integer')
], async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { topicIds } = req.body;
    
    // Start transaction
    await new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    try {
      // Remove existing user topics
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM user_topics WHERE user_id = ?', [userId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Add new user topics if any
      if (topicIds.length > 0) {
        // Verify all topic IDs exist
        const placeholders = topicIds.map(() => '?').join(',');
        const existingTopics = await new Promise((resolve, reject) => {
          db.all(`SELECT id FROM topics WHERE id IN (${placeholders})`, topicIds, (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(row => row.id));
          });
        });
        
        // Check if all provided topic IDs are valid
        const invalidTopics = topicIds.filter(id => !existingTopics.includes(id));
        if (invalidTopics.length > 0) {
          throw new Error(`Invalid topic IDs: ${invalidTopics.join(', ')}`);
        }
        
        // Insert new user-topic relationships
        const stmt = db.prepare('INSERT INTO user_topics (user_id, topic_id) VALUES (?, ?)');
        for (const topicId of topicIds) {
          await new Promise((resolve, reject) => {
            stmt.run([userId, topicId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
        stmt.finalize();
      }
      
      // Commit transaction
      await new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Return updated user topics
      const updatedTopics = await new Promise((resolve, reject) => {
        db.all(`
          SELECT t.id, t.name 
          FROM user_topics ut
          JOIN topics t ON ut.topic_id = t.id
          WHERE ut.user_id = ?
        `, [userId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      res.json(updatedTopics);
      
    } catch (error) {
      // Rollback transaction on error
      await new Promise((resolve) => {
        db.run('ROLLBACK', () => {
          resolve();
        });
      });
      throw error;
    }
    
  } catch (error) {
    console.error('Update user topics error:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to update user topics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enroll user in courses
router.post('/:id/courses', authenticateToken, allowSelfOrAdmin(), [
  body('courseIds').isArray().withMessage('courseIds must be an array'),
  body('courseIds.*').isInt().withMessage('Each course ID must be an integer')
], async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { courseIds } = req.body;
    
    // Start transaction
    await new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    try {
      // Remove existing user courses
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM user_courses WHERE user_id = ?', [userId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Add new user courses if any
      if (courseIds.length > 0) {
        // Check if courses table exists
        const tableExists = await new Promise((resolve) => {
          db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='courses'", (err, row) => {
            resolve(!!row);
          });
        });
        
        if (!tableExists) {
          throw new Error('Courses functionality is not implemented yet');
        }
        
        // Verify all course IDs exist
        const placeholders = courseIds.map(() => '?').join(',');
        const existingCourses = await new Promise((resolve, reject) => {
          db.all(`SELECT id FROM courses WHERE id IN (${placeholders})`, courseIds, (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(row => row.id));
          });
        });
        
        // Check if all provided course IDs are valid
        const invalidCourses = courseIds.filter(id => !existingCourses.includes(id));
        if (invalidCourses.length > 0) {
          throw new Error(`Invalid course IDs: ${invalidCourses.join(', ')}`);
        }
        
        // Insert new user-course relationships
        const stmt = db.prepare('INSERT INTO user_courses (user_id, course_id) VALUES (?, ?)');
        for (const courseId of courseIds) {
          await new Promise((resolve, reject) => {
            stmt.run([userId, courseId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
        stmt.finalize();
      }
      
      // Commit transaction
      await new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Return updated user courses
      const updatedCourses = await new Promise((resolve, reject) => {
        db.all(`
          SELECT c.id, c.name, c.description 
          FROM user_courses uc
          JOIN courses c ON uc.course_id = c.id
          WHERE uc.user_id = ?
        `, [userId], (err, rows) => {
          if (err) resolve([]); // Return empty array if courses table doesn't exist yet
          else resolve(rows);
        });
      });
      
      res.json(updatedCourses);
      
    } catch (error) {
      // Rollback transaction on error
      await new Promise((resolve) => {
        db.run('ROLLBACK', () => {
          resolve();
        });
      });
      throw error;
    }
    
  } catch (error) {
    console.error('Update user courses error:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to update user courses',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Admin route to get all users
router.get('/', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    const users = stmts.getAllUsers.all();
    res.json(users.map(({ password_hash, ...user }) => user));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router;
