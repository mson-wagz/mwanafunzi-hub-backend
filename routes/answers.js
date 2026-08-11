const express = require('express');
const { body, validationResult } = require('express-validator');
const stmts = require('../db-connection');
const { authenticate: authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get answers for a question
router.get('/question/:questionId', async (req, res) => {
  try {
    const answers = stmts.getAnswersForQuestion.all(req.params.questionId);
    res.json(answers);
  } catch (error) {
    console.error('Get answers error:', error);
    res.status(500).json({ error: 'Failed to fetch answers' });
  }
});

// Create a new answer
router.post(
  '/',
  authenticateToken,
  [
    body('question_id').isInt(),
    body('body').isLength({ min: 10 })
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Missing or invalid question_id and/or body. Please provide a valid question_id and answer body (min 10 characters).', details: errors.array() });
    }

    const { question_id, body } = req.body;
    // Ignore extra fields like topic_ids

    try {
      // Ensure question_id and user_id are integers
      const qid = parseInt(question_id, 10);
      const uid = parseInt(req.user.user_id, 10);
      if (isNaN(qid) || isNaN(uid)) {
        return res.status(400).json({ error: 'question_id and user_id must be valid integers.' });
      }
      // Check if question exists and is not deleted
      const question = stmts.getQuestionById.get(qid);
      if (!question) {
        return res.status(404).json({ error: 'Question not found. The question_id provided does not exist.' });
      }
      if (question.is_deleted) {
        return res.status(404).json({ error: 'Question is deleted. You can only answer active questions.' });
      }
      // Check if user exists and is not deleted
      const user = stmts.getUserById.get(uid);
      if (!user) {
        return res.status(404).json({ error: 'User not found. The user_id provided does not exist.' });
      }
      if (user.is_deleted) {
        return res.status(404).json({ error: 'User is deleted. You can only answer as an active user.' });
      }
      // Create answer
      try {
        const result = stmts.createAnswer.run(body, qid, uid);
        return res.status(201).json({
          id: result.lastInsertRowid,
          body,
          question_id: qid,
          answered_by: uid
        });
      } catch (err) {
        return next(err);
      }
      // Update question status to 'answered' if it was 'open'
      if (question.status === 'open') {
        stmts.updateQuestionStatus.run('answered', question_id);
      }

      
    } catch (error) {
      console.error('Create answer error:', error);
      res.status(500).json({ error: 'Failed to create answer' });
    }
  }
);

// Update an answer
router.put(
  '/:id',
  authenticateToken,
  [
    body('body').isLength({ min: 10 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const answer = stmts.getAnswerById.get(req.params.id);
      if (!answer || answer.is_deleted) {
        return res.status(404).json({ error: 'Answer not found' });
      }

      // Check if user is the author
      if (answer.answered_by !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to update this answer' });
      }

      // Update answer
      stmts.updateAnswer.run(
        req.body.body,
        answer.answer_id
      );

      const updatedAnswer = stmts.getAnswerById.get(answer.answer_id);
      res.json(updatedAnswer);
    } catch (error) {
      console.error('Update answer error:', error);
      res.status(500).json({ error: 'Failed to update answer' });
    }
  }
);

// Delete an answer (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const answer = stmts.getAnswerById.get(req.params.id);
    if (!answer || answer.is_deleted) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    // Check if user is the author or admin
    if (answer.answered_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this answer' });
    }

    // Soft delete
    stmts.softDeleteAnswer.run(answer.answer_id);
    
    // Check if there are any other answers for the question
    const remainingAnswers = stmts.getAnswersForQuestion.all(answer.question_id);
    if (remainingAnswers.length === 0) {
      // If no answers left, update question status back to 'open'
      stmts.updateQuestionStatus.run('open', answer.question_id);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete answer error:', error);
    res.status(500).json({ error: 'Failed to delete answer' });
  }
});

// Vote on an answer
router.post(
  '/:id/vote',
  authenticateToken,
  [
    body('vote').isIn(['up', 'down'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { vote } = req.body;
    const answerId = req.params.id;
    // Ensure user is authenticated and user_id is present
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: 'Authentication required or user not found' });
    }
    const userId = req.user.user_id;

    try {
      const answer = stmts.getAnswerById.get(answerId);
      if (!answer || answer.is_deleted) {
        return res.status(404).json({ error: 'Answer not found' });
      }

      // Map incoming vote to DB value
      const voteMap = { up: 'upvote', down: 'downvote' };
      const dbVoteType = voteMap[vote];
      if (!dbVoteType) {
        return res.status(400).json({ error: 'Invalid vote type' });
      }

      // Check if user has already voted
      const existingVote = stmts.getUserVote.get(answerId, userId);
      
      if (existingVote) {
        // If same vote, remove the vote
        if (existingVote.vote_type === dbVoteType) {
          stmts.removeVote.run(existingVote.vote_id);
          // Update answer vote count
          if (dbVoteType === 'upvote') {
            stmts.decrementVoteCount.run(answerId);
          }
          return res.json({ message: 'Vote removed' });
        }
        // If different vote, update the vote
        stmts.updateVote.run(dbVoteType, existingVote.vote_id);
        // Update answer vote counts
        if (dbVoteType === 'upvote') {
          stmts.incrementVoteCount.run(answerId);
          stmts.decrementVoteCount.run(answerId); // If you want to handle downvotes, adjust schema and logic
        }
      } else {
        // Add new vote
        stmts.addVote.run(answerId, userId, dbVoteType);
        // Update answer vote count
        if (dbVoteType === 'upvote') {
          stmts.incrementVoteCount.run(answerId);
        }
      }

      const updatedAnswer = stmts.getAnswerById.get(answerId);
      res.json(updatedAnswer);
    } catch (error) {
      console.error('Vote error:', error);
      res.status(500).json({ error: 'Failed to process vote' });
    }
  }
);

// Mark answer as accepted (question author only)
router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    const answer = stmts.getAnswerById.get(req.params.id);
    if (!answer || answer.is_deleted) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    // Get the question
    const question = stmts.getQuestionById.get(answer.question_id);
    
    // Check if user is the question author
    if (question.asked_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the question author can accept an answer' });
    }

    // Mark answer as accepted
    stmts.acceptAnswer.run(answer.answer_id, question.question_id);
    
    // Update question status
    stmts.updateQuestionStatus.run('answered', question.question_id);

    res.json({ message: 'Answer accepted' });
  } catch (error) {
    console.error('Accept answer error:', error);
    res.status(500).json({ error: 'Failed to accept answer' });
  }
});

module.exports = router;
