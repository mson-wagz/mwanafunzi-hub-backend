PRAGMA foreign_keys = ON;

-- Users
INSERT INTO users (username, email, password_hash, full_name, role) VALUES
('student1', 'student1@example.com', 'hashed_password_1', 'Alice Student', 'student'),
('lecturer1', 'lecturer1@example.com', 'hashed_password_2', 'Dr. Bob Lecturer', 'lecturer');

-- Topics
INSERT INTO topics (topic_name) VALUES
('Mathematics'),
('Physics'),
('Computer Science');

-- Questions
INSERT INTO questions (title, body, asked_by) VALUES
('What is the derivative of sin(x)?', 'Can someone explain the steps to differentiate sin(x)?', 1),
('Explain Newton’s second law', 'How does F=ma apply in real life?', 1);

-- Answers
INSERT INTO answers (question_id, body, answered_by) VALUES
(1, 'The derivative of sin(x) is cos(x).', 2),
(2, 'It means force equals mass times acceleration.', 2);

-- Link questions to topics
INSERT INTO question_topics (question_id, topic_id) VALUES
(1, 1),  -- derivative -> Mathematics
(2, 2);  -- Newton’s law -> Physics

-- Resources
INSERT INTO resources (title, description, file_url, file_size, file_type, uploaded_by) VALUES
('Math Notes', 'Algebra and Geometry basics', '/uploads/math.pdf', 102400, 'pdf', 2),
('Physics Lab Manual', 'Experiments for Physics 201', '/uploads/physics.pdf', 204800, 'pdf', 2);

-- Link resources to topics
INSERT INTO resource_topics (resource_id, topic_id) VALUES
(1, 1),  -- Math Notes -> Mathematics
(2, 2);  -- Physics Lab Manual -> Physics
