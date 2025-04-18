const router = require("express").Router();
const File = require("../models/file");

router.get("/:fileId", async (req, res) => {
  try {
    const file = await File.findOne({
      uuid: req.params.fileId,
    });
    if (!file) {
      return res.render("download", {
        error: "Incorrect file link",
      });
    }
    return res.render("download", {
      uuid: file.uuid,
      filename: file.filename,
      size: file.size,
      downloadLink: `https://synkross.alwaysdata.net/files/download/${file.uuid}`,
    });
  } catch (error) {
    return res.render("download", {
      error: "Something went wrong",
    });
  }
});

module.exports = router;
