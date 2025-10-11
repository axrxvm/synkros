const router = require("express").Router();
// const connectDB = require("../config/db");
// const File = require("../models/file");
const { getAllFileMetadata, deleteFileMetadata } = require("../models/file");
const fs = require("fs");

const constants = require("../constants/file-constants");

// connectDB(); // No longer needed


async function cleanupExpiredFiles() {
  let totalOldFiles = 0;
  let physicalFilesDeletedCount = 0;
  let metadataFilesDeletedCount = 0;

  try {
    const allMetadata = await getAllFileMetadata();

    if (!allMetadata || allMetadata.length === 0) {
      console.log("No files found in metadata or metadata could not be read.");
      return {
        message: "No files found in metadata or metadata could not be read.",
        totalFiles: 0,
        physicalFilesDeletedCount,
        metadataFilesDeletedCount,
      };
    }

    const olderThanTimestamp = new Date(Date.now() - constants.cleanupTimeLimit);
    const oldfiles = allMetadata.filter(
      (file) => file.createdAt && new Date(file.createdAt) < olderThanTimestamp
    );

    totalOldFiles = oldfiles.length;

    if (totalOldFiles > 0) {
      console.log(`Starting cleanup of ${totalOldFiles} files older than 24 hours`);
      for (const file of oldfiles) {
        try {
          if (!file.path || !file.path.startsWith('uploads')) {
            console.warn(`Skipping file with invalid path: ${file.path}`);
            continue;
          }
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`Successfully deleted physical file: ${file.filename} (${file.path})`);
            physicalFilesDeletedCount++;
          } else {
            console.log(`Physical file not found, skipping deletion: ${file.filename} (${file.path})`);
          }
          const metadataDeleted = await deleteFileMetadata(file.uuid);
          if (metadataDeleted) {
            console.log(`Successfully deleted metadata for: ${file.uuid}`);
            metadataFilesDeletedCount++;
          } else {
            console.log(`Could not delete metadata (or already deleted) for: ${file.uuid}`);
          }
        } catch (err) {
          console.error(`Error during cleanup for file ${file.filename} (uuid: ${file.uuid}):`, err);
        }
      }
      console.log(`Cleanup completed: ${physicalFilesDeletedCount} physical files and ${metadataFilesDeletedCount} metadata entries processed`);
    }
  } catch (error) {
    console.error("Error during cleanup process:", error);
    return {
      message: "An error occurred during the cleanup process. Check server logs.",
      totalFiles: 0,
      physicalFilesDeletedCount,
      metadataFilesDeletedCount,
    };
  }

  let message;
  if (totalOldFiles > 0) {
    message = `${physicalFilesDeletedCount} physical file(s) and ${metadataFilesDeletedCount} metadata entries of total ${totalOldFiles} old file(s) have been processed for deletion.`;
  } else {
    message = `There are no old files to be deleted, enjoy!`;
  }

  return {
    message,
    totalFiles: totalOldFiles,
    physicalFilesDeletedCount,
    metadataFilesDeletedCount,
  };
}

router.get("/", async (req, res) => {
  const result = await cleanupExpiredFiles();
  return res.render("cleanup", {
    message: result.message,
    totalFiles: result.totalFiles,
    rayId: req.rayId,
  });
});

module.exports = router;
module.exports.cleanupExpiredFiles = cleanupExpiredFiles;

module.exports = router;
