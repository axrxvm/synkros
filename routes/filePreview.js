const router = require("express").Router();
const { getFileMetadata } = require("../models/file");

router.get("/:fileId", async (req, res) => {
  try {
    const file = await getFileMetadata(req.params.fileId);
    if (!file) {
      return res.render("download", {
        error: "Incorrect file link",
        rayId: req.rayId,
      });
    }
    // Calculate remaining time until expiry
    const { cleanupTimeLimit } = require('../constants/file-constants');
    const createdAt = new Date(file.createdAt);
    const expiresAt = new Date(createdAt.getTime() + cleanupTimeLimit);
    const now = new Date();
    let msRemaining = expiresAt - now;
    msRemaining = msRemaining > 0 ? msRemaining : 0;

    return res.render("download", {
      uuid: file.uuid,
      filename: file.originalName || file.filename,
      size: file.size,
      downloadLink: `https://synkross.alwaysdata.net/files/download/${file.uuid}`,
      isE2EE: true,
      msRemaining,
      rayId: req.rayId,
    });
  } catch (error) {
    return res.render("download", {
      error: "Something went wrong",
      rayId: req.rayId,
    });
  }
});

module.exports = router;
