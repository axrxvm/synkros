const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto'); // For generating UUIDs if not provided

const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } else {
      throw error;
    }
  }
}

/**
 * Saves metadata object (including a createdAt timestamp) as data/<uuid>.json.
 * Assumes metadata object contains a uuid property. If not, one will be generated.
 * @param {object} metadata - The metadata object to save.
 * @returns {object} The saved metadata object.
 */
async function saveFileMetadata(metadata) {
  await ensureDataDir();
  if (!metadata.uuid) {
    metadata.uuid = randomUUID(); // Generate UUID if not present
  }
  metadata.createdAt = new Date().toISOString();
  metadata.updatedAt = new Date().toISOString(); // Set updatedAt on initial save as well

  const filePath = path.join(DATA_DIR, `${metadata.uuid}.json`);
  try {
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
    return metadata;
  } catch (error) {
    console.error(`Error saving metadata for ${metadata.uuid}:`, error);
    throw error;
  }
}

/**
 * Reads and parses data/<uuid>.json.
 * @param {string} uuid - The UUID of the file metadata to retrieve.
 * @returns {object|null} The metadata object or null if not found.
 */
async function getFileMetadata(uuid) {
  await ensureDataDir(); // Should not be strictly necessary for read, but good for consistency
  const filePath = path.join(DATA_DIR, `${uuid}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File not found
    }
    console.error(`Error reading metadata for ${uuid}:`, error);
    throw error; // Other errors (e.g., permission issues, parse errors)
  }
}

/**
 * Reads, updates, and saves data/<uuid>.json.
 * @param {string} uuid - The UUID of the file metadata to update.
 * @param {object} updates - An object containing the properties to update.
 * @returns {object|null} The updated metadata object or null if not found.
 */
async function updateFileMetadata(uuid, updates) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${uuid}.json`);
  try {
    let metadata = await getFileMetadata(uuid);
    if (!metadata) {
      return null; // File not found
    }

    // Merge updates
    metadata = { ...metadata, ...updates };
    metadata.updatedAt = new Date().toISOString(); // Update the timestamp

    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
    return metadata;
  } catch (error) {
    console.error(`Error updating metadata for ${uuid}:`, error);
    throw error;
  }
}

/**
 * Deletes data/<uuid>.json.
 * @param {string} uuid - The UUID of the file metadata to delete.
 * @returns {boolean} True if deletion was successful, false if file not found.
 */
async function deleteFileMetadata(uuid) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${uuid}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false; // File not found
    }
    console.error(`Error deleting metadata for ${uuid}:`, error);
    throw error;
  }
}

/**
 * Reads all .json files from the data directory and returns them as an array of objects.
 * @returns {Array<object>} An array of metadata objects.
 */
async function getAllFileMetadata() {
  await ensureDataDir();
  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(file => path.extname(file) === '.json');

    const allMetadata = [];
    for (const jsonFile of jsonFiles) {
      const uuid = path.basename(jsonFile, '.json');
      const metadata = await getFileMetadata(uuid);
      if (metadata) { // Ensure metadata is not null (e.g. if a file was deleted concurrently)
        allMetadata.push(metadata);
      }
    }
    return allMetadata;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // This can happen if DATA_DIR itself doesn't exist yet,
      // though ensureDataDir should prevent this.
      // Or if it was deleted after ensureDataDir check.
      return []; // No directory, so no files
    }
    console.error("Error reading all metadata files:", error);
    throw error;
  }
}

module.exports = {
  saveFileMetadata,
  getFileMetadata,
  updateFileMetadata,
  deleteFileMetadata,
  getAllFileMetadata,
};
