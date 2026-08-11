// utils/storage.js
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const { logger } = require('./logger');
const { errorResponse } = require('./apiResponse');

// Base upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    return UPLOAD_DIR;
  } catch (error) {
    logger.error('Error creating upload directory:', error);
    throw new Error('Failed to create upload directory');
  }
};

// Generate a unique filename
const generateFilename = (originalname) => {
  const ext = mime.extension(mime.lookup(originalname) || 'application/octet-stream');
  return `${uuidv4()}.${ext}`;
};

// Save uploaded file
const saveFile = async (file, subfolder = '') => {
  try {
    const uploadDir = await ensureUploadDir();
    const filename = generateFilename(file.originalname);
    const filePath = subfolder ? path.join(subfolder, filename) : filename;
    const fullPath = path.join(uploadDir, filePath);

    // Create subdirectory if needed
    if (subfolder) {
      const subDir = path.dirname(fullPath);
      await fs.mkdir(subDir, { recursive: true });
    }

    // Save file
    await fs.writeFile(fullPath, file.buffer);

    return {
      filename,
      path: filePath,
      fullPath,
      size: file.size,
      mimetype: file.mimetype,
      url: `/uploads/${filePath.replace(/\\/g, '/')}`,
    };
  } catch (error) {
    logger.error('Error saving file:', error);
    throw new Error('Failed to save file');
  }
};

// Delete a file
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

// Get file stream for download
const getFileStream = async (filePath) => {
  try {
    const fullPath = path.join(UPLOAD_DIR, filePath);
    const stats = await fs.stat(fullPath);

    if (!stats.isFile()) {
      return null;
    }

    const stream = fs.createReadStream(fullPath);
    return {
      stream,
      stats,
      mimetype: mime.lookup(filePath) || 'application/octet-stream',
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

module.exports = {
  ensureUploadDir,
  generateFilename,
  saveFile,
  deleteFile,
  getFileStream,
  UPLOAD_DIR,
};
