const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const { logger } = require('./logger');
const { errorResponse } = require('./apiResponse');

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types with their MIME types and extensions
const ALLOWED_FILE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
};

// Base upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * Ensure upload directory exists
 * @returns {Promise<string>} Path to upload directory
 */
const ensureUploadDir = async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    return UPLOAD_DIR;
  } catch (error) {
    logger.error('Error creating upload directory:', error);
    throw new Error('Failed to create upload directory');
  }
};

/**
 * Validate file type and size
 * @param {Object} file - File object with mimetype and size
 * @returns {Object} Validation result
 */
const validateFile = (file) => {
  const errors = [];
  
  // Check file type
  if (!ALLOWED_FILE_TYPES[file.mimetype]) {
    errors.push(`File type '${file.mimetype}' is not allowed`);
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : null,
  };
};

/**
 * Generate a unique filename
 * @param {string} originalname - Original filename
 * @returns {string} Generated filename with extension
 */
const generateFilename = (originalname) => {
  const ext = mime.extension(mime.lookup(originalname) || 'application/octet-stream');
  return `${uuidv4()}.${ext}`;
};

/**
 * Save uploaded file to disk
 * @param {Object} file - File object with buffer and originalname
 * @param {string} [subfolder] - Optional subfolder within uploads directory
 * @returns {Promise<Object>} File info
 */
const saveFile = async (file, subfolder = '') => {
  try {
    // Ensure upload directory exists
    const uploadDir = await ensureUploadDir();
    const filename = generateFilename(file.originalname);
    const filePath = subfolder ? path.join(subfolder, filename) : filename;
    const fullPath = path.join(uploadDir, filePath);
    
    // Create subdirectory if it doesn't exist
    if (subfolder) {
      const subDir = path.dirname(fullPath);
      await fs.mkdir(subDir, { recursive: true });
    }
    
    // Save file
    await fs.writeFile(fullPath, file.buffer);
    
    // Get file stats
    const stats = await fs.stat(fullPath);
    
    return {
      filename,
      path: filePath,
      fullPath,
      size: stats.size,
      mimetype: file.mimetype,
      url: `/uploads/${filePath.replace(/\\/g, '/')}`,
    };
  } catch (error) {
    logger.error('Error saving file:', error);
    throw new Error('Failed to save file');
  }
};

/**
 * Delete a file from disk
 * @param {string} filePath - Relative path to the file
 * @returns {Promise<boolean>} True if file was deleted, false if it didn't exist
 */
const deleteFile = async (filePath) => {
  try {
    const fullPath = path.join(UPLOAD_DIR, filePath);
    await fs.unlink(fullPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false; // File didn't exist
    }
    logger.error('Error deleting file:', error);
    throw new Error('Failed to delete file');
  }
};

/**
 * Get file stream for download
 * @param {string} filePath - Relative path to the file
 * @returns {Promise<Object>} File stream and info
 */
const getFileStream = async (filePath) => {
  try {
    const fullPath = path.join(UPLOAD_DIR, filePath);
    const stats = await fs.stat(fullPath);
    
    if (!stats.isFile()) {
      return null;
    }
    
    const stream = fs.createReadStream(fullPath);
    const mimetype = mime.lookup(filePath) || 'application/octet-stream';
    
    return {
      stream,
      stats,
      mimetype,
      filename: path.basename(filePath),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    logger.error('Error getting file stream:', error);
    throw new Error('Failed to get file');
  }
};

/**
 * Middleware for handling file uploads
 * @param {string} fieldName - Name of the file field in the form
 * @param {string} [subfolder] - Optional subfolder to save files in
 * @returns {Function} Express middleware
 */
const handleFileUpload = (fieldName, subfolder = '') => {
  return async (req, res, next) => {
    try {
      if (!req.files || !req.files[fieldName]) {
        return next();
      }
      
      const file = req.files[fieldName];
      const validation = validateFile(file);
      
      if (!validation.isValid) {
        return errorResponse(res, 'Invalid file', 400, { errors: validation.errors });
      }
      
      const fileInfo = await saveFile(file, subfolder);
      req.fileInfo = fileInfo;
      next();
    } catch (error) {
      logger.error('File upload error:', error);
      errorResponse(res, 'Failed to process file upload', 500);
    }
  };
};

module.exports = {
  ensureUploadDir,
  validateFile,
  generateFilename,
  saveFile,
  deleteFile,
  getFileStream,
  handleFileUpload,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  UPLOAD_DIR,
};
