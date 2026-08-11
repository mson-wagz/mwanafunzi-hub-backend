const winston = require('winston');
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, json } = format;
const path = require('path');
const fs = require('fs').promises;
const { ensureDir } = require('./fileUtils');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for different log levels
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Log format for console
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  
  if (stack) {
    log += `\n${stack}`;
  }
  
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  
  return log;
});

// Log format for files
const fileFormat = combine(
  timestamp(),
  json()
);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
ensureDir(logsDir);

// Configure transports
const transportsList = [
  // Console transport for development
  new transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      consoleFormat
    ),
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
  
  // Error logs
  new transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
  }),
  
  // Combined logs
  new transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileFormat,
  }),
];

// Create logger instance
const logger = createLogger({
  levels,
  level: 'debug',
  format: combine(
    timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'mwanafunzi-hub' },
  transports: transportsList,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Optionally exit the process
  // process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Optionally exit the process
  // process.exit(1);
});

/**
 * Log HTTP requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const httpLogger = (req, res, next) => {
  // Skip logging for health checks and static files
  if (req.path === '/health' || req.path.startsWith('/static')) {
    return next();
  }
  
  const start = Date.now();
  
  // Log request
  logger.http('Request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    query: req.query,
    params: req.params,
  });
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.http('Response', {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      duration: `${duration}ms`,
      contentLength: res.get('content-length'),
      contentType: res.get('content-type'),
    });
  });
  
  next();
};

/**
 * Log database queries
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {number} duration - Query execution time in ms
 */
const logQuery = (query, params, duration) => {
  if (process.env.NODE_ENV !== 'test') {
    logger.debug('Database Query', {
      query,
      params,
      duration: `${duration}ms`,
    });
  }
};

/**
 * Log errors with context
 * @param {Error} error - Error object
 * @param {string} context - Context where the error occurred
 * @param {Object} metadata - Additional metadata
 */
const logError = (error, context = 'Application', metadata = {}) => {
  logger.error(`${context} Error: ${error.message}`, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...metadata,
  });
};

/**
 * Log API requests and responses
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {Object} request - Request data
 * @param {Object} response - Response data
 * @param {number} status - HTTP status code
 * @param {number} duration - Request duration in ms
 */
const logApiCall = (method, url, request = {}, response = {}, status, duration) => {
  logger.info('API Call', {
    method,
    url,
    request,
    response,
    status,
    duration: `${duration}ms`,
  });
};

/**
 * Rotate log files
 * @returns {Promise<void>}
 */
const rotateLogs = async () => {
  try {
    const files = await fs.readdir(logsDir);
    const now = new Date();
    
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath);
        const fileAge = (now - stats.mtime) / (1000 * 60 * 60 * 24); // in days
        
        // Rotate logs older than 7 days
        if (fileAge > 7) {
          const newPath = `${filePath}.${now.toISOString().split('T')[0]}`;
          await fs.rename(filePath, newPath);
          logger.info(`Rotated log file: ${file}`);
        }
      }
    }
  } catch (error) {
    logError(error, 'Log Rotation');
  }
};

// Schedule log rotation (daily)
if (process.env.NODE_ENV === 'production') {
  // Rotate logs at midnight every day
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // Next day
    0, 0, 0 // Midnight
  );
  
  const timeUntilMidnight = midnight - now;
  
  setTimeout(() => {
    rotateLogs();
    // Set up daily rotation
    setInterval(rotateLogs, 24 * 60 * 60 * 1000);
  }, timeUntilMidnight);
}

module.exports = {
  logger,
  httpLogger,
  logQuery,
  logError,
  logApiCall,
  rotateLogs,
};
