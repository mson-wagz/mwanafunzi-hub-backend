// routes/resources.js
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../db-connection");
const stmts = require("../db-connection");
const { authenticate: authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

/**
 * GET /api/resources
 * Query params:
 *   - search: text search in title/description
 *   - topic: filter by topic name
 *   - limit, offset: pagination
 */
router.get("/", async (req, res) => {
  try {
    const { search, topic, limit = 20, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(r.title LIKE ? OR r.description LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    if (topic) {
      conditions.push(`r.resource_id IN (
        SELECT rt.resource_id 
        FROM resource_topics rt 
        JOIN topics t ON rt.topic_id = t.topic_id 
        WHERE t.name = ?
      )`);
      params.push(topic);
    }

    let sql = `
      SELECT r.*,
        (SELECT GROUP_CONCAT(t.name)
         FROM resource_topics rt
         JOIN topics t ON rt.topic_id = t.topic_id
         WHERE rt.resource_id = r.resource_id) as topic_names
      FROM resources r
    `;
    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " AND r.approved = 1 ORDER BY r.created_at DESC LIMIT ? OFFSET ?";

    params.push(Number(limit), Number(offset));

    // Use prepared statement for fetching resources
    const resources = stmts.getResources.all();
    res.json(resources);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

/**
 * POST /api/resources
 * Upload a new resource with topics
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { title, description, user_id, topics = [] } = req.body;
    const file = req.file;

    if (!title || !user_id || !file) {
      return res.status(400).json({ error: "Title, user_id, and file required" });
    }

    // Validate user exists
    const user = db.getUserById.get(user_id);
    if (!user || user.is_deleted) {
      return res.status(404).json({ error: "User not found" });
    }

    // Insert resource using prepared statement
    const result = db.createResource.run(
      title,
      description,
      `/uploads/${file.filename}`,
      file.size,
      file.mimetype,
      user_id
    );
    const resource_id = result.lastInsertRowid;

    // Handle topics using prepared statement
    if (topics.length) {
      const topicList = Array.isArray(topics) ? topics : topics.split(",");
      for (const topicId of topicList) {
        db.db.prepare(
          `INSERT OR IGNORE INTO resource_topics (resource_id, topic_id) VALUES (?, ?)`
        ).run(resource_id, topicId);
      }
    }

    res.status(201).json({ resource_id, message: "Resource uploaded successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload resource" });
  }
});

/**
 * GET /api/resources/:id
 * Fetch a single resource by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const resource = await db.get(
      `SELECT r.*,
        (SELECT GROUP_CONCAT(t.name)
         FROM resource_topics rt
         JOIN topics t ON rt.topic_id = t.topic_id
         WHERE rt.resource_id = r.resource_id) as topic_names
       FROM resources r WHERE r.resource_id = ? AND r.approved = 1`,
      [req.params.id]
    );

    if (!resource) return res.status(404).json({ error: "Resource not found" });

    res.json(resource);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch resource" });
  }
});

// Download a resource file and increment download count
router.get('/:id/download', async (req, res) => {
  try {
    // Fetch resource
    const resource = db.getResourceById.get(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    if (!resource.approved) {
      return res.status(403).json({ error: 'Resource not approved for download.' });
    }
    // Increment download count
    db.incrementResourceDownloadCount.run(req.params.id);
    // Send file
    const filePath = path.join(__dirname, '../uploads', path.basename(resource.file_url));
    return res.download(filePath, resource.title || undefined, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download resource' });
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download resource' });
  }
});

/**
 * PUT /api/resources/:id
 * Update a resource’s metadata and topics
 */
router.put("/:id", async (req, res) => {
  try {
    const { title, description, topics = [] } = req.body;

    await db.run(
      `UPDATE resources SET title = ?, description = ? WHERE resource_id = ?`,
      [title, description, req.params.id]
    );

    if (topics.length) {
      await db.run(`DELETE FROM resource_topics WHERE resource_id = ?`, [
        req.params.id,
      ]);

      const topicList = Array.isArray(topics) ? topics : topics.split(",");
      for (const name of topicList) {
        let topic = await db.get(`SELECT topic_id FROM topics WHERE name = ?`, [name.trim()]);
        if (!topic) {
          const insert = await db.run(
            `INSERT INTO topics (name) VALUES (?)`,
            [name.trim()]
          );
          topic = { topic_id: insert.lastID };
        }
        await db.run(
          `INSERT OR IGNORE INTO resource_topics (resource_id, topic_id) VALUES (?, ?)`,
          [req.params.id, topic.topic_id]
        );
      }
    }

    res.json({ message: "Resource updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update resource" });
  }
});

/**
 * DELETE /api/resources/:id
 * Delete a resource
 */
router.delete("/:id", async (req, res) => {
  try {
    await db.run(`DELETE FROM resource_topics WHERE resource_id = ?`, [req.params.id]);
    await db.run(`DELETE FROM resources WHERE resource_id = ?`, [req.params.id]);
    res.json({ message: "Resource deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete resource" });
  }
});

/**
 * GET /api/resources/topics/list
 * Fetch all topics
 */
router.get("/topics/list", async (req, res) => {
  try {
    const topics = await db.all(`SELECT * FROM topics ORDER BY name ASC`);
    res.json(topics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

/**
 * GET /api/resources/topics/popular
 * Get most popular topics by usage
 */
router.get("/topics/popular", async (req, res) => {
  try {
    const topics = await db.all(`
      SELECT t.name, COUNT(rt.resource_id) as usage_count
      FROM topics t
      JOIN resource_topics rt ON t.topic_id = rt.topic_id
      GROUP BY t.topic_id
      ORDER BY usage_count DESC
      LIMIT 10
    `);
    res.json(topics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch popular topics" });
  }
});

// Approve resource route (admin only)
router.put('/:id/approve', authenticateToken, async (req, res, next) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can approve resources.' });
    }
    const resource = stmts.getResourceById.get(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }
    stmts.approveResource.run(req.params.id);
    return res.json({ message: 'Resource approved.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
