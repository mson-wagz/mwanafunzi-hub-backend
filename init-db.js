const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Database file path
const dbPath = path.join(__dirname, 'app.db');

// Remove old database if it exists
if (fs.existsSync(dbPath)) {
  console.log('🗑 Removing existing database file...');
  fs.unlinkSync(dbPath);
}

// Create a new database
const db = new Database(dbPath, {
  verbose: console.log, // log SQL queries
});

// Enable foreign keys and performance settings
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');

function runSQLFile(filePath) {
  console.log(`📖 Reading ${filePath}...`);
  const sql = fs.readFileSync(filePath, 'utf8');
  try {
    db.exec('BEGIN TRANSACTION;');
    db.exec(sql);
    db.exec('COMMIT;');
    console.log(`✅ Executed ${filePath} successfully.`);
  } catch (err) {
    console.error(`❌ Error executing ${filePath}:`);
    console.error(err.message);
    db.exec('ROLLBACK;');
    process.exit(1);
  }
}

try {
  // Run schema first
  runSQLFile(path.join(__dirname, 'schema.sql'));

  // Run seed next
  runSQLFile(path.join(__dirname, 'seed.sql'));

  // Print DB stats
  const stats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM users) as user_count,
      (SELECT COUNT(*) FROM topics) as topic_count,
      (SELECT COUNT(*) FROM resources) as resource_count,
      (SELECT COUNT(*) FROM questions) as question_count,
      (SELECT COUNT(*) FROM answers) as answer_count,
      (SELECT COUNT(*) FROM answer_votes) as vote_count,
      (SELECT COUNT(*) FROM question_topics) as question_topic_count,
      (SELECT COUNT(*) FROM resource_topics) as resource_topic_count
  `).get();

  console.log('\n📊 Database Stats:');
  console.table([stats]);

} catch (err) {
  console.error('❌ Database initialization failed:');
  console.error(err);
  process.exit(1);
} finally {
  db.close();
  console.log('🔒 Database connection closed.');
}
