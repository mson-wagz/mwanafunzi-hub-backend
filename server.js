require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { db, close } = require('./db-connection');
const { logger, httpLogger } = require('./utils/logger');

// Import routes
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const questionsRouter = require('./routes/questions');
const answersRouter = require('./routes/answers');
const resourcesRouter = require('./routes/resources');
const adminRouter = require('./routes/admin');
const dashboardRouter = require('./routes/dashboard');
const feedRouter = require('./routes/feed');
const topicsRouter = require('./routes/topics');

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Middleware
app.use(helmet()); // Security headers

// Allow both the client URL (production) and localhost (dev) as CORS origins
const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL
].filter(Boolean); // drops CLIENT_URL if it's not set

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, server-to-server, some mobile clients)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`Blocked by CORS: ${origin}`);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' })); // Parse JSON with size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(httpLogger);

// Static files
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  db.get('SELECT 1', (err) => {
    if (err) {
      logger.error('Health check failed:', err);
      return res.status(503).json({
        status: 'error',
        message: 'Service Unavailable',
        error: 'Database connection error'
      });
    }

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: process.env.npm_package_version
    });
  });
});

// API routes with debugging
const routes = [
  { path: '/api/auth', router: authRouter },
  { path: '/api/users', router: usersRouter },
  { path: '/api/questions', router: questionsRouter },
  { path: '/api/answers', router: answersRouter },
  { path: '/api/resources', router: resourcesRouter },
  { path: '/api/topics', router: topicsRouter },
  { path: '/api/dashboard', router: dashboardRouter },
  { path: '/api/feed', router: feedRouter },
  { path: '/api/admin', router: adminRouter }
];

// Register routes with debugging
routes.forEach(route => {
  console.log(`Registering route: ${route.path}`);
  console.log(`Router type: ${typeof route.router}`);
  console.log('Router keys:', Object.keys(route.router || {}));

  if (typeof route.router !== 'function') {
    console.error(`ERROR: Router for ${route.path} is not a function. Got:`, route.router);
  }

  app.use(route.path, route.router);
  console.log(`Successfully registered: ${route.path}\n`);
});

// 👇 Root endpoint for /
app.get('/', (req, res) => {
  res.json({
    service: 'Mwanafunzi Hub API',
    status: 'running 🚀',
    environment: NODE_ENV,
    version: process.env.npm_package_version
  });
});

// 404 handler
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// Error handler
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  const errorResponse = {
    error: {
      message: err.message || 'Internal Server Error',
      status: statusCode,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      stack: NODE_ENV === 'development' ? err.stack : undefined
    }
  };

  logger.error(`${statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  logger.error(err.stack);

  res.status(statusCode).json(errorResponse);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running in ${NODE_ENV} mode on port ${PORT}`);
  logger.info(`API Documentation: http://localhost:${PORT}/api/docs`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  logger.error(err);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  logger.error(err);
  process.exit(1);
});

// Graceful shutdown
const exitHandler = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    close();
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => exitHandler('SIGTERM'));
process.on('SIGINT', () => exitHandler('SIGINT'));

module.exports = { app, server };