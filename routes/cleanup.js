const router = require("express").Router();
const connectDB = require("../config/db");
const File = require("../models/file");
const fs = require("fs");

const constants = require("../constants/file-constants");

connectDB();

router.get("/", async (req, res) => {
  let totalFiles = 0,
    deletedFiles = 0,
    tobeDeletedFiles = [];

  const oldfiles = await File.find({
    createdAt: {
      $lt: new Date(Date.now() - constants.cleanupTimeLimit),
    },
  });

  totalFiles = oldfiles.length;
  if (oldfiles.length) {
    for (const file of oldfiles) {
      try {
        fs.unlinkSync(file.path);
        console.log(`successfully deleted ${file.filename}`);
      } catch (err) {
        console.log(`error while deleting file ${err} `);
      } finally {
        tobeDeletedFiles.push(file._id);
      }
    }
  }

  const deleted = await File.deleteMany({ _id: { $in: tobeDeletedFiles } });
  deletedFiles = deleted.deletedCount;
  const message =
    totalFiles > 0
      ? `${deletedFiles} of total ${totalFiles} files have been deleted from storage.`
      : `There are no files to be deleted, enjoy!`;

  return res.render("cleanup", {
    message: message,
    totalFiles: totalFiles,
  });
});

module.exports = router;
