// db-connection.js
const Database = require('better-sqlite3');
const path = require('path');

// Open database
const db = new Database(path.join(__dirname, 'app.db'), {
  verbose: console.log,
});

// Always enforce foreign keys
db.pragma('foreign_keys = ON');

// Export prepared statements
module.exports = {
  db,

  // --- Users ---
  getUserById: db.prepare('SELECT * FROM users WHERE user_id = ?'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getAllUsers: db.prepare(`
    SELECT user_id, email, full_name, role, created_at 
    FROM users
    WHERE is_deleted = 0
    ORDER BY created_at DESC
  `),
  createUser: db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `),

  // --- User Updates ---
  updateUserProfile: db.prepare(`
    UPDATE users SET full_name = ?, bio = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `),
  updateUserPassword: db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `),
  updateUsername: db.prepare(`
    UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `),
  updateEmail: db.prepare(`
    UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `),

  // --- Duplicate checks ---
  getUserByUsernameExcludingId: db.prepare(`
    SELECT * FROM users WHERE username = ? AND user_id != ?
  `),
  getUserByEmailExcludingId: db.prepare(`
    SELECT * FROM users WHERE email = ? AND user_id != ?
  `),

  // --- Questions ---
  getQuestionById: db.prepare('SELECT * FROM questions WHERE question_id = ?'),
  getQuestions: db.prepare(`
    SELECT q.*, u.full_name AS author_name, u.email AS author_email
    FROM questions q
    JOIN users u ON q.asked_by = u.user_id
    WHERE q.is_deleted = 0
    ORDER BY q.created_at DESC
  `),
  createQuestion: db.prepare(`
    INSERT INTO questions (title, body, asked_by)
    VALUES (?, ?, ?)
  `),
  searchQuestions: db.prepare(`
    SELECT q.*, u.full_name AS author_name, u.email AS author_email
    FROM questions q
    JOIN users u ON q.asked_by = u.user_id
    WHERE q.is_deleted = 0 AND (q.title LIKE ? OR q.body LIKE ?)
    ORDER BY q.created_at DESC
  `),
  getAnswerCount: db.prepare('SELECT COUNT(*) as count FROM answers WHERE question_id = ? AND is_deleted = 0'),
  incrementQuestionViewCount: db.prepare('UPDATE questions SET views_count = views_count + 1 WHERE question_id = ?'),
  updateQuestion: db.prepare('UPDATE questions SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE question_id = ?'),
  removeQuestionTopics: db.prepare('DELETE FROM question_topics WHERE question_id = ?'),

  // --- Answers ---
  getAnswerById: db.prepare('SELECT * FROM answers WHERE answer_id = ?'),
  getAnswersForQuestion: db.prepare(`
    SELECT a.*, u.full_name AS author_name, u.email AS author_email
    FROM answers a
    JOIN users u ON a.answered_by = u.user_id
    WHERE a.question_id = ? AND a.is_deleted = 0
    ORDER BY a.created_at DESC
  `),
  createAnswer: db.prepare(`
    INSERT INTO answers (body, question_id, answered_by)
    VALUES (?, ?, ?)
  `),

  // --- Votes ---
  getUserVote: db.prepare(`
    SELECT * FROM answer_votes
    WHERE answer_id = ? AND user_id = ?
  `),
  addVote: db.prepare(`
    INSERT INTO answer_votes (answer_id, user_id, vote_type)
    VALUES (?, ?, ?)
  `),
  updateVote: db.prepare(`
    UPDATE answer_votes SET vote_type = ? WHERE vote_id = ?
  `),
  removeVote: db.prepare(`
    DELETE FROM answer_votes WHERE vote_id = ?
  `),
  incrementVoteCount: db.prepare(`
    UPDATE answers SET upvotes = upvotes + 1 WHERE answer_id = ?
  `),
  decrementVoteCount: db.prepare(`
    UPDATE answers SET upvotes = upvotes - 1 WHERE answer_id = ?
  `),

  // --- Resources ---
  getResourceById: db.prepare('SELECT * FROM resources WHERE resource_id = ?'),
  getResources: db.prepare(`
    SELECT r.*, u.full_name AS uploader_name, u.email AS uploader_email
    FROM resources r
    JOIN users u ON r.uploaded_by = u.user_id
    WHERE r.is_deleted = 0
    ORDER BY r.created_at DESC
  `),
  getApprovedResources: db.prepare(`
    SELECT r.*, u.full_name AS uploader_name, u.email AS uploader_email
    FROM resources r
    JOIN users u ON r.uploaded_by = u.user_id
    WHERE r.is_deleted = 0 AND r.approved = 1
    ORDER BY r.created_at DESC
  `),
  approveResource: db.prepare('UPDATE resources SET approved = 1 WHERE resource_id = ?'),
  createResource: db.prepare(`
    INSERT INTO resources (title, description, file_url, file_size, file_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  incrementResourceDownloadCount: db.prepare('UPDATE resources SET download_count = download_count + 1 WHERE resource_id = ?'),

  // --- Topics ---
  getAllTopics: db.prepare('SELECT * FROM topics'),
  getTopicById: db.prepare('SELECT * FROM topics WHERE topic_id = ?'),
  getTopicByName: db.prepare('SELECT * FROM topics WHERE topic_name = ?'),
  searchTopics: db.prepare('SELECT * FROM topics WHERE topic_name LIKE ?'),
  createTopic: db.prepare(`INSERT INTO topics (topic_name, description, parent_id) VALUES (?, ?, ?)`),
  updateTopic: db.prepare(`UPDATE topics SET topic_name = ?, description = ?, parent_id = ? WHERE topic_id = ?`),
  deleteTopic: db.prepare('DELETE FROM topics WHERE topic_id = ?'),

  getResourceCountByTopic: db.prepare(`SELECT COUNT(*) as count FROM resource_topics WHERE topic_id = ?`),
  getQuestionCountByTopic: db.prepare(`SELECT COUNT(*) as count FROM question_topics WHERE topic_id = ?`),

  getResourcesByTopic: db.prepare(`
    SELECT r.* FROM resources r
    JOIN resource_topics rt ON r.resource_id = rt.resource_id
    WHERE rt.topic_id = ?
  `),
  getQuestionsByTopic: db.prepare(`
    SELECT q.* FROM questions q
    JOIN question_topics qt ON q.question_id = qt.question_id
    WHERE qt.topic_id = ?
  `),
  
  // --- Question Topics ---
  getTopicsForQuestion: db.prepare(`
    SELECT t.* FROM topics t
    JOIN question_topics qt ON t.topic_id = qt.topic_id
    WHERE qt.question_id = ?
  `),
  addQuestionTopic: db.prepare(`
    INSERT INTO question_topics (question_id, topic_id)
    VALUES (?, ?)
  `),

  // --- Resource Topics ---
  getTopicsForResource: db.prepare(`
    SELECT t.* FROM topics t
    JOIN resource_topics rt ON t.topic_id = rt.topic_id
    WHERE rt.resource_id = ?
  `),
  addResourceTopic: db.prepare(`
    INSERT INTO resource_topics (resource_id, topic_id)
    VALUES (?, ?)
  `),

  // Close the database connection
  close: () => db.close()
};
