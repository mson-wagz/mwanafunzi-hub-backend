const fs = require('fs').promises;
const path = require('path');

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<string>} - The directory path
 */
const ensureDir = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    throw error;
  }
};

/**
 * Check if a file or directory exists
 * @param {string} path - Path to check
 * @returns {Promise<boolean>} - True if exists, false otherwise
 */
const exists = async (path) => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read a file as JSON
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<object>} - Parsed JSON data
 */
const readJsonFile = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error);
    throw error;
  }
};

/**
 * Write data to a file as JSON
 * @param {string} filePath - Path to the file
 * @param {object} data - Data to write
 * @returns {Promise<void>}
 */
const writeJsonFile = async (filePath, data) => {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error writing JSON file ${filePath}:`, error);
    throw error;
  }
};

/**
 * Get file stats
 * @param {string} filePath - Path to the file
 * @returns {Promise<fs.Stats>} - File stats
 */
const getFileStats = async (filePath) => {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    console.error(`Error getting stats for ${filePath}:`, error);
    throw error;
  }
};

module.exports = {
  ensureDir,
  exists,
  readJsonFile,
  writeJsonFile,
  getFileStats
};
