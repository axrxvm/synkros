const router = require("express").Router();
const multer = require("multer");
const { v4: uuid4 } = require("uuid");
const path = require("path");
const qr = require("qrcode");
const File = require("../models/file");
const crypto = require("crypto");
const fs = require("fs");
const constants = require("../constants/file-constants");

let storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
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

router.post("/", (req, res) => {
  upload(req, res, async (err) => {
    if (!req.file) {
      return res.status(400).json({
        error: "File missing",
      });
    }

    if (err) {
      return res.status(500).send({
        error: err.message,
      });
    }

    // Encryption logic starts here
    try {
      const encryptionKey = process.env.KEY;
      if (!encryptionKey || Buffer.from(encryptionKey).length !== 32) {
        console.error("Server encryption key not configured correctly.");
        // Attempt to delete the uploaded file if key is invalid
        if (req.file && req.file.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkErr) {
            console.error("Error deleting file after key validation failure:", unlinkErr);
          }
        }
        return res.status(500).json({
          error: "Server encryption key not configured correctly. Please contact the administrator.",
        });
      }

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey), iv);
      
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      
      const encryptedData = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
      const dataToStore = Buffer.concat([iv, encryptedData]);
      
      fs.writeFileSync(filePath, dataToStore);
      
      // Update file size to reflect the size of the encrypted file (IV + encrypted content)
      req.file.size = dataToStore.length;

    } catch (encryptionError) {
      console.error("Encryption error:", encryptionError);
      // Attempt to delete the uploaded file if encryption fails
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error("Error deleting file after encryption failure:", unlinkErr);
        }
      }
      return res.status(500).json({
        error: "Failed to encrypt the file.",
      });
    }
    // Encryption logic ends here

    const file = new File({
      filename: req.file.filename,
      uuid: uuid4(),
      path: req.file.path,
      size: req.file.size, // This will now be the encrypted file size
    });

    const response = await file.save();
    const fileUrl = `https://synkross.alwaysdata.net/files/${response.uuid}`;
    qr.toDataURL(fileUrl, (err, src) => {
      return res.status(200).json({
        file: fileUrl,
        qr: err ? null : src,
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
    const file = await File.findOne({
      uuid: uuid,
    });

    if (!file.sender) {
      file.sender = sender;
      file.recipients = [recipient];
    } else {
      if (file.recipients.includes(recipient)) {
        return res.status(422).send({
          error: `Email already sent to ${recipient}.`,
        });
      } else {
        file.recipients.push(recipient);
      }
    }

    await file.save();
    const sendMail = require("../services/emailService");
    sendMail({
      from: sender,
      to: recipient,
      subject: "New Shared File",
      text: `${sender} shared a file with you.`,
      html: require("../services/emailTemplate")({
        sender,
        downloadLink: `${process.env.APP_BASE_URL}/files/${file.uuid}?source=email`,
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
