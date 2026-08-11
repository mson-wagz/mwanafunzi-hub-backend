const express = require('express');
const { body, validationResult } = require('express-validator');
const stmts = require('../db-connection');
const { authenticate: authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all topics
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let topics;
    
    if (search) {
      topics = stmts.searchTopics.all(`%${search}%`);
    } else {
      topics = stmts.getAllTopics.all();
    }

    // Get resource and question counts for each topic
    const topicsWithCounts = await Promise.all(
      topics.map(async (topic) => {
        const resourceCount = stmts.getResourceCountByTopic.get(topic.topic_id)?.count || 0;
        const questionCount = stmts.getQuestionCountByTopic.get(topic.topic_id)?.count || 0;
        
        return {
          ...topic,
          resource_count: resourceCount,
          question_count: questionCount
        };
      })
    );

    res.json(topicsWithCounts);
  } catch (error) {
    console.error('Get topics error:', error);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// Get a single topic with related resources and questions
router.get('/:id', async (req, res) => {
  try {
    const topic = stmts.getTopicById.get(req.params.id);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Get related resources
    const resources = stmts.getResourcesByTopic.all(topic.topic_id);
    
    // Get related questions
    const questions = stmts.getQuestionsByTopic.all(topic.topic_id);

    res.json({
      ...topic,
      resources,
      questions
    });
  } catch (error) {
    console.error('Get topic error:', error);
    res.status(500).json({ error: 'Failed to fetch topic' });
  }
});

// Create a new topic (admin only)
router.post(
  '/',
  authenticateToken,
  [
    body('name').isLength({ min: 3, max: 100 }),
    body('description').optional().isLength({ max: 500 }),
    body('parent_id').optional().isInt()
  ],
  async (req, res) => {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, parent_id } = req.body;

    try {
      // Check if topic with same name already exists
      const existingTopic = stmts.getTopicByName.get(name);
      if (existingTopic) {
        return res.status(400).json({ error: 'Topic with this name already exists' });
      }

      // Create topic
      const result = stmts.createTopic.run(
        name,
        description || null,
        parent_id || null
      );

      const newTopic = stmts.getTopicById.get(result.lastInsertRowid);
      res.status(201).json(newTopic);
    } catch (error) {
      console.error('Create topic error:', error);
      res.status(500).json({ error: 'Failed to create topic' });
    }
  }
);

// Update a topic (admin only)
router.put(
  '/:id',
  authenticateToken,
  [
    body('name').optional().isLength({ min: 3, max: 100 }),
    body('description').optional().isLength({ max: 500 }),
    body('parent_id').optional().isInt()
  ],
  async (req, res) => {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, parent_id } = req.body;
    const topicId = req.params.id;

    try {
      // Check if topic exists
      const existingTopic = stmts.getTopicById.get(topicId);
      if (!existingTopic) {
        return res.status(404).json({ error: 'Topic not found' });
      }

      // Check if name is being changed and if new name is already taken
      if (name && name !== existingTopic.name) {
        const nameExists = stmts.getTopicByName.get(name);
        if (nameExists) {
          return res.status(400).json({ error: 'Topic with this name already exists' });
        }
      }

      // Update topic
      stmts.updateTopic.run(
        name || existingTopic.name,
        description !== undefined ? description : existingTopic.description,
        parent_id !== undefined ? parent_id : existingTopic.parent_id,
        topicId
      );

      const updatedTopic = stmts.getTopicById.get(topicId);
      res.json(updatedTopic);
    } catch (error) {
      console.error('Update topic error:', error);
      res.status(500).json({ error: 'Failed to update topic' });
    }
  }
);

// Delete a topic (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  // Check if user is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    // Check if topic exists
    const topic = stmts.getTopicById.get(req.params.id);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Check if topic has any resources or questions
    const resourceCount = stmts.getResourceCountByTopic.get(topic.topic_id)?.count || 0;
    const questionCount = stmts.getQuestionCountByTopic.get(topic.topic_id)?.count || 0;
    
    if (resourceCount > 0 || questionCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete topic with associated resources or questions' 
      });
    }

    // Delete topic
    stmts.deleteTopic.run(topic.topic_id);
    
    res.status(204).send();
  } catch (error) {
    console.error('Delete topic error:', error);
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

module.exports = router;
