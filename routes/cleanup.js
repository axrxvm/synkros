const router = require("express").Router();
// const connectDB = require("../config/db");
// const File = require("../models/file");
const { getAllFileMetadata, deleteFileMetadata } = require("../models/file");
const fs = require("fs");
const path = require("path");

const constants = require("../constants/file-constants");

// connectDB(); // No longer needed

/**
 * Cleanup orphaned files in /uploads that have no corresponding metadata in /data
 */
async function cleanupOrphanedFiles() {
  let orphanedFilesCount = 0;
  let deletedOrphanedFiles = 0;

  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    
    // Check if uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      console.log("Uploads directory does not exist.");
      return {
        message: "Uploads directory does not exist.",
        orphanedFilesCount: 0,
        deletedOrphanedFiles: 0,
      };
    }

    // Get all files in uploads directory (excluding .gitkeep)
    const uploadedFiles = fs.readdirSync(uploadsDir).filter(file => {
      const filePath = path.join(uploadsDir, file);
      return fs.statSync(filePath).isFile() && file !== '.gitkeep';
    });

    if (uploadedFiles.length === 0) {
      console.log("No files found in uploads directory.");
      return {
        message: "No files found in uploads directory.",
        orphanedFilesCount: 0,
        deletedOrphanedFiles: 0,
      };
    }

    // Get all metadata files
    const allMetadata = await getAllFileMetadata();
    
    // Create a Set of all referenced file paths for quick lookup
    const referencedPaths = new Set();
    allMetadata.forEach(metadata => {
      if (metadata.path) {
        // Normalize the path to handle both relative and absolute paths
        const normalizedPath = metadata.path.replace(/\\/g, '/');
        const fileName = normalizedPath.split('/').pop();
        referencedPaths.add(fileName);
      }
    });

    console.log(`Found ${uploadedFiles.length} files in uploads directory and ${referencedPaths.size} referenced files in metadata.`);

    // Find orphaned files
    const orphanedFiles = uploadedFiles.filter(file => !referencedPaths.has(file));
    orphanedFilesCount = orphanedFiles.length;

    if (orphanedFilesCount > 0) {
      console.log(`Starting cleanup of ${orphanedFilesCount} orphaned files...`);
      
      for (const file of orphanedFiles) {
        try {
          const filePath = path.join(uploadsDir, file);
          fs.unlinkSync(filePath);
          console.log(`Successfully deleted orphaned file: ${file}`);
          deletedOrphanedFiles++;
        } catch (err) {
          console.error(`Error deleting orphaned file ${file}:`, err);
        }
      }

      console.log(`Orphaned files cleanup completed: ${deletedOrphanedFiles} of ${orphanedFilesCount} files deleted.`);
    } else {
      console.log("No orphaned files found.");
    }
  } catch (error) {
    console.error("Error during orphaned files cleanup:", error);
    return {
      message: "An error occurred during the orphaned files cleanup process. Check server logs.",
      orphanedFilesCount: 0,
      deletedOrphanedFiles: 0,
    };
  }

  let message;
  if (orphanedFilesCount > 0) {
    message = `${deletedOrphanedFiles} of ${orphanedFilesCount} orphaned file(s) have been deleted.`;
  } else {
    message = "No orphaned files found.";
  }

  return {
    message,
    orphanedFilesCount,
    deletedOrphanedFiles,
  };
}

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
  // Run both cleanup operations
  const expiredResult = await cleanupExpiredFiles();
  const orphanedResult = await cleanupOrphanedFiles();
  
  // Combine results for display
  const combinedMessage = `${expiredResult.message}\n${orphanedResult.message}`;
  
  return res.render("cleanup", {
    message: combinedMessage,
    totalFiles: expiredResult.totalFiles,
    orphanedFiles: orphanedResult.orphanedFilesCount,
    rayId: req.rayId,
  });
});

module.exports = router;
module.exports.cleanupExpiredFiles = cleanupExpiredFiles;
module.exports.cleanupOrphanedFiles = cleanupOrphanedFiles;

module.exports = router;
