const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const { authenticate: authenticateToken } = require('../middleware/auth');

/**
 * GET /feed
 * Get combined feed of questions and resources from user's followed topics
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const db = new Database(path.join(__dirname, '../app.db'));
    const { limit = 20, offset = 0, type } = req.query;
    
    // Get user's followed topics
    let userTopics = [];
    const userTopicsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_topics'").get();
    if (userTopicsTable) {
      userTopics = db.prepare('SELECT topic_id FROM user_topics WHERE user_id = ?').all(userId).map(r => r.topic_id);
    }
    
    // If user isn't following any topics, return empty results
    if (userTopics.length === 0) {
      return res.json({
        items: [],
        pagination: {
          total: 0,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    }
    
    const placeholders = userTopics.map(() => '?').join(',');
    const params = [...userTopics];
    
    // Build the base queries for questions and resources
    let questionsQuery = `
      SELECT 
        'question' as type,
        q.question_id AS id,
        q.title,
        q.body as content,
        q.created_at,
        u.username as author_name,
        u.user_id as author_id,
        (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.question_id AND a.is_deleted = 0) as answer_count,
        (SELECT GROUP_CONCAT(t.topic_name) 
         FROM question_topics qt 
         JOIN topics t ON qt.topic_id = t.topic_id 
         WHERE qt.question_id = q.question_id) as topic_names
      FROM questions q
      JOIN users u ON q.asked_by = u.user_id
      JOIN question_topics qt ON q.question_id = qt.question_id
      WHERE qt.topic_id IN (${placeholders})
        AND q.status = 'open'
        AND q.is_deleted = 0
    `;
    
    let resourcesQuery = `
      SELECT 
        'resource' as type,
        r.resource_id AS id,
        r.title,
        r.description as content,
        r.created_at,
        u.username as author_name,
        u.user_id as author_id,
        r.download_count,
        (SELECT GROUP_CONCAT(t.topic_name) 
         FROM resource_topics rt 
         JOIN topics t ON rt.topic_id = t.topic_id 
         WHERE rt.resource_id = r.resource_id) as topic_names
      FROM resources r
      JOIN users u ON r.uploaded_by = u.user_id
      JOIN resource_topics rt ON r.resource_id = rt.resource_id
      WHERE rt.topic_id IN (${placeholders})
        AND r.is_deleted = 0
    `;
    
    // Add type filter if specified
    if (type === 'questions') {
      resourcesQuery = ''; // Only get questions
    } else if (type === 'resources') {
      questionsQuery = ''; // Only get resources
    }
    
    // Combine the queries with UNION ALL if both are needed
    let combinedQuery = '';
    if (questionsQuery && resourcesQuery) {
      combinedQuery = `
        ${questionsQuery}
        UNION ALL
        ${resourcesQuery}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      params.push(parseInt(limit), parseInt(offset));
    } else if (questionsQuery) {
      combinedQuery = `
        ${questionsQuery}
        GROUP BY q.id
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      params.push(parseInt(limit), parseInt(offset));
    } else if (resourcesQuery) {
      combinedQuery = `
        ${resourcesQuery}
        GROUP BY r.id
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      params.push(parseInt(limit), parseInt(offset));
    }
    
    // Get total count for pagination
    let countQuery = '';
    if (type === 'questions') {
      countQuery = `
        SELECT COUNT(DISTINCT q.id) as total
        FROM questions q
        JOIN question_topics qt ON q.id = qt.question_id
        WHERE qt.topic_id IN (${placeholders})
          AND q.status = 'open'
      `;
    } else if (type === 'resources') {
      countQuery = `
        SELECT COUNT(DISTINCT r.id) as total
        FROM resources r
        JOIN resource_topics rt ON r.id = rt.resource_id
        WHERE rt.topic_id IN (${placeholders})
      `;
    } else {
      countQuery = `
        SELECT (SELECT COUNT(DISTINCT q.id)
                FROM questions q
                JOIN question_topics qt ON q.id = qt.question_id
                WHERE qt.topic_id IN (${placeholders})
                  AND q.status = 'open') +
               (SELECT COUNT(DISTINCT r.id)
                FROM resources r
                JOIN resource_topics rt ON r.id = rt.resource_id
                WHERE rt.topic_id IN (${placeholders})) as total
      `;
    }
    
    // Execute queries in parallel
    const items = combinedQuery
      ? db.prepare(combinedQuery).all(...params).map(row => ({
          ...row,
          topic_names: row.topic_names ? row.topic_names.split(',') : [],
          ...(row.type === 'question' && { answer_count: row.answer_count, url: `/questions/${row.id}` }),
          ...(row.type === 'resource' && { download_count: row.download_count, url: `/resources/${row.id}` })
        }))
      : [];

    const countRow = db.prepare(countQuery).get(...userTopics);
    const countResult = countRow ? countRow.total : 0;

    db.close();
    
    res.json({
      items,
      pagination: {
        total: countResult,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
    
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ 
      error: 'Failed to load feed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
