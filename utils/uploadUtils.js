const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const mime = require('mime-types');
const { logger } = require('./logger');

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024; 

// Allowed file types
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

// Allowed image types for processing
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Configure storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, '../uploads');
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ext = mime.extension(file.mimetype) || 'bin';
    const filename = `${uuidv4()}.${ext}`;
    cb(null, filename);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  if (ALLOWED_FILE_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

/**
 * Process and save an uploaded image
 * @param {Object} file - Multer file object
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processed file info
 */
const processImage = async (file, options = {}) => {
  const {
    width = 1200,
    height = 800,
    quality = 80,
    format = 'webp',
    thumbnailWidth = 300,
    thumbnailHeight = 200,
  } = options;

  try {
    const fileExt = path.extname(file.originalname).toLowerCase();
    const baseFilename = path.basename(file.filename, fileExt);
    const uploadDir = path.dirname(file.path);
    
    // Process main image
    const processedFilename = `${baseFilename}.${format}`;
    const processedPath = path.join(uploadDir, processedFilename);
    
    await sharp(file.path)
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFormat(format, {
        quality,
        mozjpeg: { quality },
        webp: { quality },
      })
      .toFile(processedPath);
    
    // Create thumbnail
    const thumbnailFilename = `${baseFilename}_thumb.${format}`;
    const thumbnailPath = path.join(uploadDir, thumbnailFilename);
    
    await sharp(file.path)
      .resize(thumbnailWidth, thumbnailHeight, {
        fit: 'cover',
        position: 'center',
      })
      .toFormat(format, {
        quality: Math.max(60, quality - 20), // Slightly lower quality for thumbnails
      })
      .toFile(thumbnailPath);
    
    // Get file stats
    const [originalStats, processedStats, thumbnailStats] = await Promise.all([
      fs.stat(file.path),
      fs.stat(processedPath),
      fs.stat(thumbnailPath),
    ]);
    
    // Clean up original file
    await fs.unlink(file.path);
    
    return {
      original: {
        filename: path.basename(file.path),
        size: originalStats.size,
        mimetype: file.mimetype,
      },
      processed: {
        filename: processedFilename,
        path: processedPath,
        size: processedStats.size,
        mimetype: `image/${format}`,
        dimensions: { width, height },
      },
      thumbnail: {
        filename: thumbnailFilename,
        path: thumbnailPath,
        size: thumbnailStats.size,
        mimetype: `image/${format}`,
        dimensions: { width: thumbnailWidth, height: thumbnailHeight },
      },
    };
  } catch (error) {
    logger.error('Image processing error:', error);
    throw new Error('Failed to process image');
  }
};

/**
 * Process and save an uploaded file
 * @param {Object} file - Multer file object
 * @returns {Promise<Object>} Processed file info
 */
const processFile = async (file) => {
  try {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    
    if (isImage) {
      return await processImage(file);
    }
    
    // For non-image files, just return the file info
    const stats = await fs.stat(file.path);
    
    return {
      original: {
        filename: file.filename,
        path: file.path,
        size: stats.size,
        mimetype: file.mimetype,
      },
    };
  } catch (error) {
    logger.error('File processing error:', error);
    throw new Error('Failed to process file');
  }
};

/**
 * Delete a file from the filesystem
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} True if file was deleted, false if it didn't exist
 */
const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false; // File didn't exist
    }
    throw error;
  }
};

/**
 * Delete multiple files
 * @param {Array<string>} filePaths - Array of file paths to delete
 * @returns {Promise<Array<{path: string, success: boolean, error: Error|null}>>} Results of delete operations
 */
const deleteFiles = async (filePaths) => {
  const results = [];
  
  for (const filePath of filePaths) {
    try {
      await deleteFile(filePath);
      results.push({ path: filePath, success: true, error: null });
    } catch (error) {
      results.push({ path: filePath, success: false, error });
    }
  }
  
  return results;
};

/**
 * Validate file size and type
 * @param {Object} file - File object with mimetype and size
 * @param {number} maxSize - Maximum file size in bytes
 * @param {Array<string>} allowedTypes - Allowed MIME types
 * @returns {Object} Validation result
 */
const validateFile = (file, maxSize = MAX_FILE_SIZE, allowedTypes = Object.keys(ALLOWED_FILE_TYPES)) => {
  const errors = [];
  
  if (!file) {
    errors.push('No file provided');
    return { isValid: false, errors };
  }
  
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
    errors.push(`File size exceeds the maximum limit of ${maxSizeMB}MB`);
  }
  
  if (!allowedTypes.includes(file.mimetype)) {
    errors.push(`File type '${file.mimetype}' is not allowed`);
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : null,
  };
};

/**
 * Generate a file URL
 * @param {string} filename - Filename
 * @returns {string} Public URL for the file
 */
const getFileUrl = (filename) => {
  if (!filename) return null;
  return `/uploads/${filename}`;
};

module.exports = {
  upload,
  processImage,
  processFile,
  deleteFile,
  deleteFiles,
  validateFile,
  getFileUrl,
  ALLOWED_FILE_TYPES,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE,
};
