const express = require('express');
const { body, validationResult } = require('express-validator');
const stmts = require('../db-connection');
const { authenticate: authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all questions
router.get('/', async (req, res) => {
  try {
    const { topic, search } = req.query;
    let questions;

    if (topic) {
      questions = stmts.getQuestionsByTopic.all(topic);
    } else if (search) {
      questions = stmts.searchQuestions.all(`%${search}%`);
    } else {
      questions = stmts.getQuestions.all();
    }

    // Get answer count for each question
    const questionsWithCounts = questions.map(question => ({
      ...question,
      answer_count: stmts.getAnswerCount.get(question.question_id)?.count || 0
    }));

    res.json(questionsWithCounts);
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Get a single question with answers
router.get('/:id', async (req, res) => {
  try {
    const question = stmts.getQuestionById.get(req.params.id);
    if (!question || question.is_deleted) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Increment view count
    stmts.incrementQuestionViewCount.run(question.question_id);
    question.views_count += 1;

    // Get answers
    const answers = stmts.getAnswersForQuestion.all(question.question_id);
    
    res.json({
      ...question,
      answers
    });
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// Create a new question
router.post(
  '/',
  authenticateToken,
  // Normalize alias keys before validation
  (req, res, next) => {
    // content -> body
    if (req.body && req.body.body == null && req.body.content != null) {
      req.body.body = req.body.content;
    }
    // topicIds -> topic_ids
    if (req.body && req.body.topic_ids == null && req.body.topicIds != null) {
      req.body.topic_ids = req.body.topicIds;
    }
    // Normalize topic_ids to array of integers if provided
    if (Array.isArray(req.body?.topic_ids)) {
      req.body.topic_ids = req.body.topic_ids
        .map((v) => (typeof v === 'string' ? v.trim() : v))
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n));
    }
    next();
  },
  [
    body('title').isLength({ min: 10, max: 200 }),
    body('body').isLength({ min: 10 }).withMessage('Body must be at least 10 characters'),
    body('topic_ids').optional().isArray()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, body, topic_ids = [] } = req.body;

    try {
      // Create question
      const result = stmts.createQuestion.run(
        title,
        body,
        req.user.user_id
      );

      const questionId = result.lastInsertRowid;

      // Add topic associations
      topic_ids.forEach(topicId => {
        stmts.addQuestionTopic.run(questionId, topicId);
      });
      const question = stmts.getQuestionById.get(questionId);
      
      res.status(201).json(question);
    } catch (error) {
      console.error('Create question error:', error);
      res.status(500).json({ error: 'Failed to create question' });
    }
  }
);

// Update a question
router.put(
  '/:id',
  authenticateToken,
  [
    body('title').optional().isLength({ min: 10, max: 200 }),
    body('body').optional().isLength({ min: 20 }),
    body('topic_ids').optional().isArray()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const question = stmts.getQuestionById.get(req.params.id);
      if (!question || question.is_deleted) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Check if user is the author
      if (question.asked_by !== req.user.user_id) {
        return res.status(403).json({ error: 'Not authorized to update this question' });
      }

      const { title, body, topic_ids } = req.body;

      // Update question
      if (title || body) {
        stmts.updateQuestion.run(
          title || question.title,
          body || question.body,
          question.question_id
        );
      }

      // Update topics if provided
      if (topic_ids) {
        // Remove existing topic associations
        stmts.removeQuestionTopics.run(question.question_id);
        
        // Add new topic associations
        topic_ids.forEach(topicId => {
          stmts.addQuestionTopic.run(question.question_id, topicId);
        });
      }

      const updatedQuestion = stmts.getQuestionById.get(question.question_id);
      res.json(updatedQuestion);
    } catch (error) {
      console.error('Update question error:', error);
      res.status(500).json({ error: 'Failed to update question' });
    }
  }
);

// Delete a question (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const question = stmts.getQuestionById.get(req.params.id);
    if (!question || question.is_deleted) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Check if user is the author or admin
    if (question.asked_by !== req.user.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this question' });
    }

    // Soft delete
    stmts.softDeleteQuestion.run(question.question_id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

module.exports = router;
