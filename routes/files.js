const router = require("express").Router();
const multer = require("multer");
const { v4: uuid4 } = require("uuid");
const path = require("path");
const qr = require("qrcode");
const { saveFileMetadata, getFileMetadata, updateFileMetadata } = require("../models/file");
const crypto = require("crypto");
const fs = require("fs");
const constants = require("../constants/file-constants");

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

let storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Double-check directory exists at upload time
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqname = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqname);
  },
});

let upload = multer({
  storage,
  limits: {
    fileSize: constants.maxAllowedFileSize,
  },
}).single("myFile");

// E2EE Upload endpoint - files are already encrypted client-side
router.post("/", (req, res) => {
  upload(req, res, async (err) => {
    // Handle multer errors first
    if (err) {
      console.error("Multer error:", err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: "File too large. Maximum size allowed is " + (constants.maxAllowedFileSize / (1024 * 1024)) + "MB"
        });
      }
      return res.status(500).json({
        error: "Upload failed: " + err.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded. Please select a file to upload.",
      });
    }

    // Generate a unique encryption key for this file (client-side will use this)
    const encryptionKey = crypto.randomBytes(32).toString('hex');
    
    // Store file metadata (file is already encrypted client-side)
    const metadata = {
      filename: req.file.filename,
      uuid: uuid4(),
      path: req.file.path,
      size: req.file.size,
      originalName: req.body.originalName || req.file.originalname
    };

    let savedFile;
    try {
      savedFile = await saveFileMetadata(metadata);
      if (!savedFile) {
        throw new Error("saveFileMetadata returned null");
      }
    } catch (metadataError) {
      console.error("Metadata save error:", metadataError.message);

      // Clean up uploaded file if metadata save fails
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error("Error deleting file after metadata save failure:", unlinkErr.message);
        }
      }

      return res.status(500).json({
        error: "Failed to save file information. Please try again."
      });
    }

    // Include encryption key in URL fragment (not sent to server)
    const fileUrl = `https://synkross.alwaysdata.net/files/${savedFile.uuid}#${encryptionKey}`;
    qr.toDataURL(fileUrl, (err, src) => {
      return res.status(200).json({
        file: fileUrl,
        qr: err ? null : src,
        encryptionKey: encryptionKey // Also return key separately for client use
      });
    });
  });
});

router.post("/sendmail", async (req, res) => {
  const { uuid, sender, recipient } = req.body;

  if (!uuid || !sender || !recipient) {
    return res.status(400).send({
      error: "Missing required fields",
    });
  }

  try {
    const file = await getFileMetadata(uuid);

    if (!file) {
      return res.status(404).send({ error: "File not found." });
    }

    // Ensure recipients is an array, even if it's not present in the JSON
    if (!file.recipients) {
      file.recipients = [];
    }

    if (!file.sender) {
      file.sender = sender;
      file.recipients = [recipient]; // Initialize recipients as a new array
    } else {
      if (file.recipients.includes(recipient)) {
        return res.status(422).send({
          error: `Email already sent to ${recipient}.`,
        });
      } else {
        file.recipients.push(recipient);
      }
    }

    const updatedFile = await updateFileMetadata(uuid, { sender: file.sender, recipients: file.recipients });

    if (!updatedFile) {
      // This could happen if the file was deleted between getFileMetadata and updateFileMetadata
      return res.status(500).json({
        error: "Failed to update file metadata. File might have been deleted."
      });
    }

    // Extract encryption key from the original URL if it was provided
    const originalUrl = req.body.originalUrl || `${process.env.APP_BASE_URL}/files/${file.uuid}`;
    const encryptionKey = originalUrl.includes('#') ? originalUrl.split('#')[1] : '';
    const downloadLinkWithKey = encryptionKey ? 
      `${process.env.APP_BASE_URL}/files/${file.uuid}#${encryptionKey}` : 
      `${process.env.APP_BASE_URL}/files/${file.uuid}`;

    const sendMail = require("../services/emailService");
    sendMail({
      from: sender,
      to: recipient,
      subject: "New Shared File",
      text: `${sender} shared a file with you.`,
      html: require("../services/emailTemplate")({
        sender,
        downloadLink: downloadLinkWithKey,
        size: parseInt(file.size / 1000) + " KB",
        siteLink: process.env.APP_BASE_URL,
        expires: "24 hours",
      }),
    })
      .then(() => {
        return res.json({
          success: true,
        });
      })
      .catch((err) => {
        console.log(err);
        return res.status(500).json({
          error: "Error in email sending.",
        });
      });
  } catch (err) {
    console.log(err);
    return res.status(500).send({
      error: "Something went wrong.",
    });
  }
});

module.exports = router;
