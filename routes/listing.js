const timeAgo = require("timeago.js");
const router = require("express").Router();
const File = require("../models/file");


function formatBytes(bytes, decimals) {
  if (bytes == 0) return "0 Bytes";
  var k = 1024,
    dm = decimals || 2,
    sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

const random = new Date().getTime().toString(20);
const salt = Buffer.from(random).toString("base64");
const cleanUpLink = `https://synkross.alwaysdata.net/cleanup?ts=${random}${salt}`;
// get the code from .env file
const code = process.env.CLEANUP_CODE;
router.get("/", async (req, res) => {
  const files = await File.getAllFileMetadata();
  const allFiles = files;

  const formattedFiles = allFiles
    .map((file) => ({
      ...file,
      originalSize: file.size,
      size: formatBytes(file.size),
      uploaded: file.createdAt ? timeAgo.format(file.createdAt, "en_US") : "Unknown",
      recipients: file.recipients || [],
    }))
    .reverse();

  const totalFilesSize = formatBytes(
    allFiles.reduce((n, { size }) => n + size, 0)
  );

  return res.render("listing", {
    files: formattedFiles,
    totalSize: totalFilesSize,
    cLink: cleanUpLink,
    code: code,
  });
});

module.exports = router;
