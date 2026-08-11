const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const { authenticate: authenticateToken } = require('../middleware/auth');

/**
 * GET /dashboard
 * Get user dashboard summary
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const db = new Database(path.join(__dirname, '../app.db'));
    
    const recentQuestions = db.prepare(`
      SELECT q.question_id AS id, q.title, q.created_at, q.status,
             (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.question_id AND a.is_deleted = 0) AS answer_count
      FROM questions q
      WHERE q.asked_by = ? AND q.is_deleted = 0
      ORDER BY q.created_at DESC
      LIMIT 5
    `).all(userId);

    const recentAnswers = db.prepare(`
      SELECT a.answer_id AS id, a.body, a.created_at,
             q.question_id AS question_id, q.title AS question_title,
             (SELECT COUNT(*) FROM answer_votes av WHERE av.answer_id = a.answer_id AND av.vote_type = 'upvote') AS upvotes,
             (SELECT COUNT(*) FROM answer_votes av WHERE av.answer_id = a.answer_id AND av.vote_type = 'downvote') AS downvotes
      FROM answers a
      JOIN questions q ON a.question_id = q.question_id
      WHERE a.answered_by = ? AND a.is_deleted = 0
      ORDER BY a.created_at DESC
      LIMIT 5
    `).all(userId);

    const recentResources = db.prepare(`
      SELECT r.resource_id AS id, r.title, r.created_at, r.download_count,
             (SELECT COUNT(DISTINCT rt.topic_id) FROM resource_topics rt WHERE rt.resource_id = r.resource_id) AS topic_count
      FROM resources r
      WHERE r.uploaded_by = ? AND r.is_deleted = 0
      ORDER BY r.created_at DESC
      LIMIT 5
    `).all(userId);
    
    // Get user's followed topics
    let followedTopics = [];
    const userTopicsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_topics'").get();
    if (userTopicsTable) {
      followedTopics = db.prepare(`
        SELECT t.topic_id AS id, t.topic_name AS name,
               (SELECT COUNT(*) FROM questions q JOIN question_topics qtt ON q.question_id = qtt.question_id WHERE qtt.topic_id = t.topic_id) AS question_count,
               (SELECT COUNT(*) FROM resources r JOIN resource_topics rtt ON r.resource_id = rtt.resource_id WHERE rtt.topic_id = t.topic_id) AS resource_count
        FROM user_topics ut
        JOIN topics t ON ut.topic_id = t.topic_id
        WHERE ut.user_id = ?
        ORDER BY t.topic_name
      `).all(userId);
    }
    
    // Get user's enrolled courses (if courses are implemented)
    let enrolledCourses = [];
    try {
      const coursesTableExists = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='courses'").get();
      
      if (coursesTableExists) {
        enrolledCourses = db.prepare(`
          SELECT c.id, c.name, c.description,
                 (SELECT COUNT(*) FROM course_resources cr WHERE cr.course_id = c.id) AS resource_count
          FROM user_courses uc
          JOIN courses c ON uc.course_id = c.id
          WHERE uc.user_id = ?
          ORDER BY c.name
        `).all(userId);
      }
    } catch (error) {
      console.error('Error fetching enrolled courses:', error);
      // Continue without courses if there's an error
    }
    
    const stats = {
      questions: (db.prepare('SELECT COUNT(*) as count FROM questions WHERE asked_by = ?').get(userId) || { count: 0 }).count,
      answers: (db.prepare('SELECT COUNT(*) as count FROM answers WHERE answered_by = ?').get(userId) || { count: 0 }).count,
      resources: (db.prepare('SELECT COUNT(*) as count FROM resources WHERE uploaded_by = ?').get(userId) || { count: 0 }).count,
      upvotes: (db.prepare(`
        SELECT COUNT(*) as count
        FROM answer_votes av
        JOIN answers a ON av.answer_id = a.answer_id
        WHERE a.answered_by = ? AND av.vote_type = 'upvote'
      `).get(userId) || { count: 0 }).count
    };

    db.close();
    
    res.json({
      stats,
      recent: {
        questions: recentQuestions,
        answers: recentAnswers,
        resources: recentResources
      },
      followedTopics,
      enrolledCourses
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      error: 'Failed to load dashboard',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /dashboard/resources
 * Get user's recent resources
 */
router.get('/resources', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const db = new Database(path.join(__dirname, '../app.db'));
    const { limit = 20, offset = 0 } = req.query;
    
    const resources = db.prepare(`
      SELECT r.*,
             (SELECT GROUP_CONCAT(t.topic_name)
              FROM resource_topics rt
              JOIN topics t ON rt.topic_id = t.topic_id
              WHERE rt.resource_id = r.resource_id) as topic_names
      FROM resources r
      WHERE r.uploaded_by = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, parseInt(limit), parseInt(offset));
    
    // Format topic names as array
    const formattedResources = resources.map(resource => ({
      ...resource,
      topic_names: resource.topic_names ? resource.topic_names.split(',') : []
    }));
    
    // Get total count for pagination
    const total = (db.prepare('SELECT COUNT(*) as count FROM resources WHERE uploaded_by = ?').get(userId) || { count: 0 }).count;

    db.close();
    
    res.json({
      resources: formattedResources,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
    
  } catch (error) {
    console.error('Dashboard resources error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch resources',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /dashboard/questions
 * Get user's recent questions
 */
router.get('/questions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const db = new Database(path.join(__dirname, '../app.db'));
    const { limit = 20, offset = 0 } = req.query;
    
    const questions = db.prepare(`
      SELECT q.*,
             (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.question_id) as answer_count,
             (SELECT GROUP_CONCAT(t.topic_name)
              FROM question_topics qt
              JOIN topics t ON qt.topic_id = t.topic_id
              WHERE qt.question_id = q.question_id) as topic_names
      FROM questions q
      WHERE q.asked_by = ?
      ORDER BY q.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, parseInt(limit), parseInt(offset));
    
    // Format topic names as array
    const formattedQuestions = questions.map(question => ({
      ...question,
      topic_names: question.topic_names ? question.topic_names.split(',') : []
    }));
    
    // Get total count for pagination
    const total = (db.prepare('SELECT COUNT(*) as count FROM questions WHERE asked_by = ?').get(userId) || { count: 0 }).count;

    db.close();
    
    res.json({
      questions: formattedQuestions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
    
  } catch (error) {
    console.error('Dashboard questions error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch questions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
